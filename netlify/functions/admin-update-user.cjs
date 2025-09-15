// netlify/functions/admin-update-user.cjs
// Admin-only updates for Auth and Firestore mirrors: status, disabled, markVerified, revokeSessions, delete.

const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'cadenschulz@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function requesterIsAdmin(decoded) {
  const byClaim = !!(decoded?.roles && decoded.roles.admin === true);
  const byEmail = ADMIN_EMAILS.includes((decoded.email || '').toLowerCase());
  return byClaim || byEmail;
}

const VALID_STATUS = new Set(['active', 'suspended', 'flagged']);

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    // AuthN + Admin
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization' });
    const decoded = await auth.verifyIdToken(m[1], true);
    if (!requesterIsAdmin(decoded)) return json(403, { ok: false, error: 'Admins only' });

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const uid = (body.uid || '').trim();
    if (!uid) return json(400, { ok: false, error: 'uid is required' });

    const ops = {};
    const updatesIndex = {};
    const updatesProfile = {};

    // 1) Toggle disabled
    if (typeof body.disabled === 'boolean') {
      ops.disabled = body.disabled;
    }

    // 2) Mark email verified/unverified
    if (typeof body.markVerified === 'boolean') {
      ops.emailVerified = body.markVerified;
      updatesIndex.emailVerified = body.markVerified;
    }

    // 3) Set status (active|suspended|flagged)
    if (typeof body.status === 'string') {
      const s = body.status.trim().toLowerCase();
      if (!VALID_STATUS.has(s)) return json(400, { ok: false, error: 'Invalid status' });
      updatesProfile.status = s;      // source of truth
      updatesIndex.status = s;        // mirror for listing
    }

    // 4) Delete user entirely
    const doDelete = body.delete === true;

    // Apply changes
    let authUpdated = null;

    if (doDelete) {
      // Best-effort Firestore cleanup first
      try { await db.collection('users').doc(uid).delete(); } catch {}
      try { await db.collection('users_index').doc(uid).delete(); } catch {}
      // Delete Auth user
      await auth.deleteUser(uid);
      return json(200, { ok: true, deleted: true });
    }

    // Update Auth user if needed
    if (Object.keys(ops).length) {
      authUpdated = await auth.updateUser(uid, ops);
    }

    // Mirror Firestore changes
    const writes = [];
    if (Object.keys(updatesProfile).length) {
      writes.push(db.collection('users').doc(uid).set(updatesProfile, { merge: true }));
    }
    if (Object.keys(updatesIndex).length) {
      writes.push(db.collection('users_index').doc(uid).set(updatesIndex, { merge: true }));
    }
    if (writes.length) await Promise.all(writes);

    // 5) Revoke sessions (forces token refresh)
    if (body.revokeSessions === true) {
      await auth.revokeRefreshTokens(uid);
    }

    return json(200, { ok: true, authUpdated: !!authUpdated, profile: updatesProfile, index: updatesIndex });
  } catch (e) {
    console.error('[admin-update-user]', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

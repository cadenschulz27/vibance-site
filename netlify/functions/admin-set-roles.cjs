// netlify/functions/admin-set-roles.cjs
// Admin-only: set custom claims roles and mirror to Firestore (/users + /users_index).

const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'cadenschulz@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// Helper: requester is admin if claim OR email allow-list
function requesterIsAdmin(decoded) {
  const byClaim = !!(decoded?.roles && decoded.roles.admin === true);
  const byEmail = ADMIN_EMAILS.includes((decoded.email || '').toLowerCase());
  return byClaim || byEmail;
}

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    // AuthN + Admin
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization: Bearer <ID token>' });
    const decoded = await auth.verifyIdToken(m[1], true);
    if (!requesterIsAdmin(decoded)) return json(403, { ok: false, error: 'Admins only' });

    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const uid = (body.uid || '').trim();
    const roles = body.roles || {};
    if (!uid) return json(400, { ok: false, error: 'uid is required' });

    // Normalize roles
    const nextRoles = {
      admin: !!roles.admin,
      moderator: !!roles.moderator,
      support: !!roles.support,
      readOnlyAdmin: !!roles.readOnlyAdmin
    };

    // Merge with existing custom claims (do not drop other claims, if any)
    const rec = await auth.getUser(uid);
    const currentClaims = rec.customClaims || {};
    const mergedClaims = { ...currentClaims, roles: nextRoles };

    // 1) Set custom claims
    await auth.setCustomUserClaims(uid, mergedClaims);

    // 2) Mirror roles to Firestore (for UI and indexing)
    await db.collection('users').doc(uid).set({ roles: nextRoles }, { merge: true });
    await db.collection('users_index').doc(uid).set({ roles: nextRoles }, { merge: true });

    // Optional: force sessions to refresh claims on next token refresh
    if (body.revokeSessions === true) {
      await auth.revokeRefreshTokens(uid);
    }

    return json(200, { ok: true, roles: nextRoles });
  } catch (e) {
    console.error('[admin-set-roles] error', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

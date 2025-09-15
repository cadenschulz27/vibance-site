// netlify/functions/admin-list-users.cjs
// Admin-only: list users with emailVerified/disabled and optional Firestore profile join.

const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'cadenschulz@gmail.com')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

function json(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

    // AuthN + Admin check
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization: Bearer <ID token>' });
    const decoded = await auth.verifyIdToken(m[1], true);
    const requesterEmail = (decoded.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(requesterEmail)) {
      return json(403, { ok: false, error: 'Admins only' });
    }

    // Query params
    const qs = event.queryStringParameters || {};
    const emailQ = (qs.email || '').trim(); // exact match if provided
    const verifiedParam = (qs.verified || '').toLowerCase();
    const verifiedFilter = verifiedParam === 'true' ? true : verifiedParam === 'false' ? false : null;
    const includeUsername = (qs.includeUsername || '').toLowerCase() === 'true';
    const limit = Math.max(1, Math.min(parseInt(qs.limit || '100', 10) || 100, 1000));
    const pageToken = qs.pageToken || undefined;

    // Fetch users
    let users = [];
    let nextPageToken = null;

    if (emailQ) {
      try {
        const rec = await auth.getUserByEmail(emailQ);
        users = [rec];
      } catch {
        return json(200, { ok: true, users: [], nextPageToken: null });
      }
    } else {
      const res = await auth.listUsers(limit, pageToken);
      users = res.users || [];
      nextPageToken = res.pageToken || null;
    }

    // Filter by verified
    if (verifiedFilter !== null) {
      users = users.filter(u => u.emailVerified === verifiedFilter);
    }

    // Optional Firestore join
    async function join(uid) {
      try {
        const snap = await db.collection('users').doc(uid).get();
        if (!snap.exists) return {};
        const d = snap.data() || {};
        return {
          username: d.username || null,
          firstName: d.firstName || null,
          lastName: d.lastName || null,
          status: d.status || null,
        };
      } catch {
        return {};
      }
    }

    const rows = [];
    for (const u of users) {
      const meta = includeUsername ? await join(u.uid) : {};
      rows.push({
        uid: u.uid,
        email: u.email || null,
        emailVerified: !!u.emailVerified,
        disabled: !!u.disabled,
        createdAt: u.metadata?.creationTime || null,
        lastSignIn: u.metadata?.lastSignInTime || null,
        displayName: u.displayName || null,
        ...meta,
      });
    }

    return json(200, { ok: true, users: rows, nextPageToken });
  } catch (e) {
    console.error('[admin-list-users] error', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

// netlify/functions/admin-backfill-users.cjs
// Admin-only: backfill /users_index from Auth + /users profile.
// - Uses JS Date (Admin SDK stores as Firestore Timestamps).
// - DOES NOT default status to 'active' anymore; only mirrors profile.status if present.
// - Enriches with usernameLower, nameConcatLower, roles, and presence defaults.

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

const toDate = (s) => (s ? new Date(s) : null);

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

    // ---- AuthN + Admin gate
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization' });

    const decoded = await auth.verifyIdToken(m[1], true);
    const requesterEmail = (decoded.email || '').toLowerCase();
    const isAdminByClaim = !!(decoded.roles && decoded.roles.admin === true);
    const isAdminByEmail = ADMIN_EMAILS.includes(requesterEmail);
    if (!isAdminByClaim && !isAdminByEmail) {
      return json(403, { ok: false, error: 'Admins only' });
    }

    // ---- Paging & sizing
    const qs = event.queryStringParameters || {};
    const pageToken = qs.pageToken || undefined;
    const batchSize = Math.min(Math.max(parseInt(qs.batchSize || '200', 10) || 200, 50), 1000);

    // ---- List users from Auth
    const res = await auth.listUsers(batchSize, pageToken);
    const users = res.users || [];

    const batch = db.batch();

    for (const u of users) {
      const uid = u.uid;

      // Join profile from /users/{uid}
      let profile = {};
      try {
        const snap = await db.collection('users').doc(uid).get();
        if (snap.exists) profile = snap.data() || {};
      } catch {
        // swallow read errors; proceed with what we have
      }

      const first = (profile.firstName || '').trim();
      const last  = (profile.lastName  || '').trim();
      const nameConcatLower = `${first} ${last}`.trim().toLowerCase();

      // Build index payload
      const payload = {
        // From Auth
        email: u.email || null,
        emailLower: (u.email || '').toLowerCase() || null,
        emailVerified: !!u.emailVerified,
        disabled: !!u.disabled,
        createdAt: toDate(u.metadata?.creationTime) || new Date(),
        lastSignIn: toDate(u.metadata?.lastSignInTime) || null,

        // From profile
        username: profile.username || null,
        usernameLower: (profile.username || '').toLowerCase() || null,
        firstName: first || null,
        lastName: last || null,
        nameConcatLower: nameConcatLower || null,
        roles: profile.roles || null,

        // Presence defaults (client presence.js will update these)
        presence: { online: false },
        lastSeenAt: null,
      };

      // IMPORTANT: do not force a default; only mirror if present
      if (typeof profile.status === 'string' && profile.status.trim()) {
        payload.status = profile.status.trim().toLowerCase();
      }

      batch.set(
        db.collection('users_index').doc(uid),
        payload,
        { merge: true }
      );
    }

    await batch.commit();

    return json(200, {
      ok: true,
      processed: users.length,
      nextPageToken: res.pageToken || null,
    });
  } catch (e) {
    console.error('[admin-backfill-users]', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

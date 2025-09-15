// netlify/functions/admin-get-user.cjs
const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'cadenschulz@gmail.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

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
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization: Bearer <ID token>' });
    const decoded = await auth.verifyIdToken(m[1], true);
    if (!requesterIsAdmin(decoded)) return json(403, { ok: false, error: 'Admins only' });

    const qs = event.queryStringParameters || {};
    const uid = (qs.uid || '').trim();
    const email = (qs.email || '').trim();
    if (!uid && !email) return json(400, { ok: false, error: 'Provide ?uid=<uid> or ?email=<email>' });

    const rec = uid ? await auth.getUser(uid) : await auth.getUserByEmail(email);

    let profile = {};
    try {
      const snap = await db.collection('users').doc(rec.uid).get();
      if (snap.exists) profile = snap.data() || {};
    } catch {}

    const providers = (rec.providerData || []).map(p => ({ providerId: p.providerId, uid: p.uid, email: p.email || null }));
    const customRoles = (rec.customClaims && rec.customClaims.roles) ? rec.customClaims.roles : null;

    return json(200, {
      ok: true,
      uid: rec.uid,
      email: rec.email || null,
      emailVerified: !!rec.emailVerified,
      disabled: !!rec.disabled,
      createdAt: rec.metadata?.creationTime || null,
      lastSignIn: rec.metadata?.lastSignInTime || null,
      tokensValidAfterTime: rec.tokensValidAfterTime || null,
      displayName: rec.displayName || null,
      providers,
      // Roles
      rolesClaims: customRoles,
      rolesProfile: profile.roles || null,
      // Profile mirrors
      username: profile.username || null,
      firstName: profile.firstName || null,
      lastName: profile.lastName || null,
      status: profile.status || null
    });
  } catch (e) {
    console.error('[admin-get-user] error', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

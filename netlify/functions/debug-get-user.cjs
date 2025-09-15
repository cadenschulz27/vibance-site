// netlify/functions/debug-get-user.cjs
const { auth } = require('../lib/firebase-admin');

function json(status, data) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}

exports.handler = async (event) => {
  try {
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization: Bearer <ID token>' });
    const idToken = m[1];

    const decoded = await auth.verifyIdToken(idToken, true);

    // Restrict to your admin email
    if ((decoded.email || '').toLowerCase() !== 'cadenschulz@gmail.com') {
      return json(403, { ok: false, error: 'Admins only' });
    }

    const qs = event.queryStringParameters || {};
    const email = qs.email;
    const uid = qs.uid;

    if (!email && !uid) {
      return json(400, { ok: false, error: 'Provide ?email=<addr> or ?uid=<uid>' });
    }

    const rec = email ? await auth.getUserByEmail(email) : await auth.getUser(uid);

    return json(200, {
      ok: true,
      uid: rec.uid,
      email: rec.email,
      emailVerified: rec.emailVerified
    });
  } catch (e) {
    return json(500, { ok: false, error: e.message });
  }
};

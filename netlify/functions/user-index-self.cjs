// netlify/functions/user-index-self.cjs
// Authenticated user upserts their own /users_index doc (core fields) without clobbering admin-managed fields (status).

const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(s, b) { return { statusCode: s, headers: CORS, body: JSON.stringify(b) }; }
const toDate = (s) => (s ? new Date(s) : null);
const VALID_STATUS = new Set(['active', 'suspended', 'flagged']);

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization' });

    const decoded = await auth.verifyIdToken(m[1], true);
    const uid = decoded.uid;

    // Fresh Auth record
    const rec = await auth.getUser(uid);

    // Join profile
    let profile = {};
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) profile = snap.data() || {};
    } catch {}

    const first = (profile.firstName || '').trim();
    const last  = (profile.lastName || '').trim();
    const nameConcatLower = `${first} ${last}`.trim().toLowerCase();

    // Build payload WITHOUT defaulting status
    const payload = {
      email: rec.email || null,
      emailLower: (rec.email || '').toLowerCase() || null,
      emailVerified: !!rec.emailVerified,
      disabled: !!rec.disabled,
      createdAt: toDate(rec.metadata?.creationTime) || new Date(),
      lastSignIn: toDate(rec.metadata?.lastSignInTime) || null,

      username: profile.username || null,
      usernameLower: (profile.username || '').toLowerCase() || null,
      firstName: first || null,
      lastName:  last  || null,
      nameConcatLower: nameConcatLower || null,

      roles: profile.roles || null,
      // presence + lastSeenAt are handled by presence.js
    };

    // Only include status if it exists and is valid on the profile doc
    if (profile.status && VALID_STATUS.has(String(profile.status))) {
      payload.status = String(profile.status);
    }

    await db.collection('users_index').doc(uid).set(payload, { merge: true });

    return json(200, { ok: true });
  } catch (e) {
    console.error('[user-index-self]', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

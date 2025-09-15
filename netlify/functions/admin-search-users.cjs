// netlify/functions/admin-search-users.cjs
// Admin-only search across /users_index with filters.

const { auth, db } = require('../lib/firebase-admin');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization' });
    const decoded = await auth.verifyIdToken(m[1], true);
    if (!requesterIsAdmin(decoded)) return json(403, { ok: false, error: 'Admins only' });

    const qs = event.queryStringParameters || {};
    const q = (qs.q || '').trim();
    const field = (qs.field || '').trim(); // 'username' | 'name' | 'email' (optional autodetect)
    const verified = qs.verified === 'true' ? true : (qs.verified === 'false' ? false : null);
    const status = (qs.status || '').trim(); // '', 'active', 'suspended', 'flagged'
    const limit = Math.min(Math.max(parseInt(qs.limit || '50', 10) || 50, 1), 200);

    const col = db.collection('users_index');

    // Build base filters
    let filters = [];
    if (verified !== null) filters.push(['emailVerified', '==', verified]);
    if (status) filters.push(['status', '==', status]);

    // Helper: apply filters to a query
    const applyFilters = (ref) => {
      let qr = ref;
      for (const [k, op, v] of filters) qr = qr.where(k, op, v);
      return qr;
    };

    // Decide mode
    let mode = field || '';
    if (!mode) {
      if (q.includes('@')) mode = 'email';
      else if (q.includes(' ')) mode = 'name';
      else mode = 'username';
    }

    let results = [];

    if (!q) {
      // No search term: just filtered list by createdAt desc
      let qr = applyFilters(col.orderBy('createdAt', 'desc')).limit(limit);
      const snap = await qr.get();
      results = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      return json(200, { ok: true, users: results, nextPageToken: null });
    }

    if (mode === 'email') {
      const snap = await applyFilters(col.where('emailLower', '==', q.toLowerCase())).limit(limit).get();
      results = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      return json(200, { ok: true, users: results, nextPageToken: null });
    }

    // Prefix search helper using range (startAt/endAt)
    const start = q.toLowerCase();
    const end = start + '\uf8ff';

    if (mode === 'username') {
      let qr = applyFilters(col.orderBy('usernameLower').startAt(start).endAt(end)).limit(limit);
      const snap = await qr.get();
      results = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      return json(200, { ok: true, users: results, nextPageToken: null });
    }

    if (mode === 'name') {
      let qr = applyFilters(col.orderBy('nameConcatLower').startAt(start).endAt(end)).limit(limit);
      const snap = await qr.get();
      results = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      return json(200, { ok: true, users: results, nextPageToken: null });
    }

    // Fallback
    return json(400, { ok: false, error: 'Invalid search mode' });
  } catch (e) {
    console.error('[admin-search-users]', e);
    return json(500, { ok: false, error: e.message || 'Internal error' });
  }
};

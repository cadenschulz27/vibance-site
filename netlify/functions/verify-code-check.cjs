// netlify/functions/verify-code-check.cjs
// Verifies a 6-digit code, marks the user as emailVerified, and cleans up.

const { auth, db } = require('../lib/firebase-admin');
const crypto = require('crypto');

/* ─── Env ──────────────────────────────────────────────────────────────── */
const HMAC_SECRET = process.env.VERIFY_CODE_SECRET || 'change-me';
const MAX_ATTEMPTS = parseInt(process.env.VERIFY_MAX_ATTEMPTS || '6', 10);
const VERIFICATION_DISABLED = String(process.env.VERIFY_DISABLED || '').toLowerCase() === 'true';

/* ─── Helpers ──────────────────────────────────────────────────────────── */
const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status, data) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(data) };
}

function hmac(code) {
  return crypto.createHmac('sha256', HMAC_SECRET).update(String(code)).digest('hex');
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

    // Require Firebase ID token
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { ok: false, error: 'Missing Authorization: Bearer <ID token>' });
    const idToken = m[1];

    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded.uid;

    if (VERIFICATION_DISABLED) {
      // Auto verify without needing code.
      try {
        await auth.updateUser(uid, { emailVerified: true });
      } catch (e) {
        console.warn('[verify-code-check] failed to auto-verify user while disabled', e);
      }
      return json(200, { ok: true, verified: true, disabled: true, message: 'Verification bypassed (temporarily disabled).' });
    }

    // Parse body only when verification is active
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const code = String(body.code || '').trim();
    if (!/^\d{6}$/.test(code)) return json(400, { ok: false, error: 'Invalid code format' });

    // Load stored code
    const ref = db.collection('verification_codes').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return json(400, { ok: false, error: 'No code requested' });

    const d = snap.data() || {};
    const now = Date.now();

    // Expired
    if (d.expiresAt && now > d.expiresAt) {
      await ref.delete().catch(() => {});
      return json(400, { ok: false, error: 'Code expired' });
    }

    // Attempts limit
    const attempts = d.attempts || 0;
    if (attempts >= MAX_ATTEMPTS) {
      await ref.delete().catch(() => {});
      return json(429, { ok: false, error: 'Too many attempts. Request a new code.' });
    }

    // Compare HMACs
    const good = d.code_hash && hmac(code) === d.code_hash;
    if (!good) {
      await ref.set({ attempts: attempts + 1 }, { merge: true });
      return json(400, { ok: false, error: 'Incorrect code', attemptsLeft: Math.max(0, MAX_ATTEMPTS - (attempts + 1)) });
    }

    // Success: mark verified and clean up
    await auth.updateUser(uid, { emailVerified: true });
    await ref.delete().catch(() => {});

    return json(200, { ok: true, verified: true });
  } catch (err) {
    console.error('[verify-code-check] error', err);
    return json(500, { ok: false, error: err.message || 'Internal error' });
  }
};

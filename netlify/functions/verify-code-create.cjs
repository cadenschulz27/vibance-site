// netlify/functions/verify-code-create.cjs
// Sends a 6-digit verification code via email and stores a hashed copy with TTL.

const { auth, db } = require('../lib/firebase-admin');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');

/* ─── Env ──────────────────────────────────────────────────────────────── */
const FROM_EMAIL = process.env.VERIFY_FROM_EMAIL || 'no-reply@vibance.co';
const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const HMAC_SECRET = process.env.VERIFY_CODE_SECRET || 'change-me';
const CODE_TTL_MIN = parseInt(process.env.VERIFY_CODE_TTL_MIN || '10', 10);           // default 10 min
const RESEND_COOLDOWN_SEC = parseInt(process.env.VERIFY_RESEND_COOLDOWN_SEC || '30', 10); // default 30s
const MAX_ATTEMPTS = parseInt(process.env.VERIFY_MAX_ATTEMPTS || '6', 10);

if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

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
    const email = decoded.email;
    if (!email) return json(400, { ok: false, error: 'User has no email address' });

    const ref = db.collection('verification_codes').doc(uid);
    const snap = await ref.get();
    const now = Date.now();

    // Basic resend cooldown
    if (snap.exists) {
      const d = snap.data() || {};
      const lastSent = d.lastSentAt || 0;
      if (now - lastSent < RESEND_COOLDOWN_SEC * 1000) {
        const wait = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (now - lastSent)) / 1000);
        return json(429, { ok: false, error: `Please wait ${wait}s before requesting another code.` });
      }
    }

    // Generate a 6-digit code
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const payload = {
      code_hash: hmac(code),
      expiresAt: now + CODE_TTL_MIN * 60 * 1000,
      attempts: 0,
      lastSentAt: now,
      email
    };

    await ref.set(payload, { merge: true });

    // Send email (if key present)
    let emailed = false;
    if (!SENDGRID_KEY) {
      console.warn('[verify-code-create] SENDGRID_API_KEY not set — skipping email send.');
    } else {
      console.log('[verify-code-create] sending', { from: FROM_EMAIL, to: email });
      await sgMail.send({
        to: email,
        from: FROM_EMAIL,
        subject: 'Your Vibance verification code',
        text: `Your verification code is: ${code}\nIt expires in ${CODE_TTL_MIN} minutes.`,
        html: `
          <div style="font-family:Inter,Arial,sans-serif;font-size:16px;color:#111">
            <p>Your Vibance verification code:</p>
            <p style="font-size:28px;font-weight:700;letter-spacing:3px">${code}</p>
            <p style="color:#666">This code expires in ${CODE_TTL_MIN} minutes.</p>
          </div>
        `,
      });
      emailed = true;
    }

    return json(200, {
      ok: true,
      emailed,
      ttlMin: CODE_TTL_MIN,
      cooldownSec: RESEND_COOLDOWN_SEC,
      attemptsLeft: MAX_ATTEMPTS
    });
  } catch (err) {
    console.error('[verify-code-create] error', err);
    return json(500, { ok: false, error: err.message || 'Internal error' });
  }
};

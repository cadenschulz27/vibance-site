// netlify/functions/plaid-sync.js
// -----------------------------------------------------------------------------
// Vibance • Netlify Function: On-demand Plaid → Firestore Sync (per user)
// -----------------------------------------------------------------------------
// What this does
// - Verifies the caller’s Firebase ID token (Authorization: Bearer <idToken>).
// - Finds the caller’s Plaid items in Firestore (users/{uid}/plaid_items/*).
// - Uses Plaid Transactions Sync API to pull new/changed transactions for a
//   given month (default = current month), then upserts them into Firestore:
//     users/{uid}/plaid_items/{itemId}/transactions/{txId}
//
// Why Transactions Sync?
// - It’s idempotent, incremental, and handles adds/modifies/removals.
//
// Request (POST):
//   headers: { Authorization: "Bearer <FirebaseIDToken>" }
//   body (JSON): { month?: "YYYY-MM" }   // optional; defaults to current month
//
// Response:
//   200 { ok:true, month:"YYYY-MM", itemsProcessed, txWritten, txRemoved, lastCursorSaved }
//
// ENV VARS required (Netlify dashboard):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY              (be sure to replace \n with real newlines)
//   PLAID_CLIENT_ID
//   PLAID_SECRET
//   PLAID_ENV                         ("sandbox" | "development" | "production")
//
// Firestore structures expected:
//   users/{uid}/plaid_items/{itemId}:
//     - access_token: string (Plaid access token; server-only!)
//     - cursor: string (optional; saved sync cursor)
//     - last_synced: Firestore Timestamp (set by this function)
// -----------------------------------------------------------------------------

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import fetch from 'node-fetch';
import { buildAddDeltas, buildModifiedDeltas, buildRemovedDeltas, summarize } from './lib/rollup-delta.cjs';

// ---------- Helpers ----------
const json = (status, data, moreHeaders = {}) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    ...moreHeaders,
  },
  body: JSON.stringify(data),
});

const bad = (status, message) => json(status, { ok: false, error: message });

function parseMonthOrDefault(m) {
  if (typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) return m;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start, end, startISO: iso(start), endISO: iso(end) };
}

function envRequired(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

// ---------- Firebase Admin (singleton) ----------
function getAdmin() {
  if (!getApps().length) {
    let projectId, clientEmail, privateKey;
    if (process.env.FIREBASE_ADMIN_SDK_CONFIG) {
      try {
        const parsed = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
        projectId = parsed.project_id;
        clientEmail = parsed.client_email;
        privateKey = parsed.private_key?.replace(/\\n/g, '\n');
        if (!projectId || !clientEmail || !privateKey) throw new Error('Missing keys in FIREBASE_ADMIN_SDK_CONFIG');
      } catch (e) {
        throw new Error('Invalid FIREBASE_ADMIN_SDK_CONFIG: ' + e.message);
      }
    } else {
      projectId = envRequired('FIREBASE_PROJECT_ID');
      clientEmail = envRequired('FIREBASE_CLIENT_EMAIL');
      privateKey = envRequired('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }
  return { auth: getAuth(), db: getFirestore() };
}

// ---------- Plaid Client ----------
function getPlaid() {
  const cfg = new Configuration({
    basePath: PlaidEnvironments[envRequired('PLAID_ENV')],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': envRequired('PLAID_CLIENT_ID'),
        'PLAID-SECRET': envRequired('PLAID_SECRET'),
      },
    },
  });
  return new PlaidApi(cfg);
}

// ---------- Core: sync one item ----------
async function syncItem({ db, plaid, uid, itemDocRef, month }) {
  const itemSnap = await itemDocRef.get();
  if (!itemSnap.exists) return { written: 0, removed: 0, cursor: null, skipped: true };

  const item = itemSnap.data() || {};
  const access_token = item.access_token;
  if (!access_token) return { written: 0, removed: 0, cursor: null, skipped: true };

  // Start from saved cursor if present; support legacy field name transactions_cursor
  let cursor = item.cursor || item.transactions_cursor || null;

  // Transactions Sync loop
  let added = [];
  let modified = [];
  let removed = [];
  while (true) {
    const req = cursor
      ? { access_token, cursor, count: 500 } // continue
      : { access_token, count: 500 };        // first call
    const resp = await plaid.transactionsSync(req);
    const data = resp.data;
    added = added.concat(data.added || []);
    modified = modified.concat(data.modified || []);
    removed = removed.concat(data.removed || []);
    cursor = data.next_cursor;
    if (!data.has_more) break;
  }

  // Keep only transactions for the requested month
  const { startISO, endISO } = monthRange(month);
  const inMonth = (iso) => iso >= startISO && iso <= endISO;

  const keepAdd = added.filter(t => inMonth(t.date || t.authorized_date || ''));
  const keepMod = modified.filter(t => inMonth(t.date || t.authorized_date || ''));
  // removals: Plaid gives {transaction_id}, we don't need to month-filter — apply blindly

  // Upsert to Firestore
  const txCol = itemDocRef.collection('transactions');
  // Build map of previous docs for modified & removed to derive deltas
  const prevMap = new Map();
  if (modified.length || removed.length) {
    const prevIds = new Set();
    modified.forEach(m => prevIds.add(m.transaction_id));
    removed.forEach(r => prevIds.add(r.transaction_id));
    const chunks = Array.from(prevIds);
    for (let i = 0; i < chunks.length; i += 400) { // Firestore per batch get limit comfortable
      const slice = chunks.slice(i, i + 400);
      const snaps = await db.getAll(...slice.map(id => txCol.doc(id)));
      snaps.forEach(s => { if (s.exists) prevMap.set(s.id, s.data()); });
    }
  }

  const batch = db.batch();
  let writeCount = 0;
  for (const t of keepAdd.concat(keepMod)) {
    const id = t.transaction_id;
    const ref = txCol.doc(id);
    batch.set(ref, {
      amount: t.amount,
      name: t.name,
      merchant_name: t.merchant_name || null,
      category: t.category || [],
      personal_finance_category: t.personal_finance_category || null,
      date: t.date || t.authorized_date || null,
      pending: !!t.pending,
      transaction_type: t.transaction_type || null,
      payment_channel: t.payment_channel || null,
      account_id: t.account_id,
      iso_currency_code: t.iso_currency_code || null,
      unofficial_currency_code: t.unofficial_currency_code || null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writeCount++;
  }
  let removeCount = 0;
  for (const r of removed) {
    const ref = txCol.doc(r.transaction_id);
    batch.delete(ref);
    removeCount++;
  }
  // Persist normalized cursor field
  batch.set(itemDocRef, { cursor, last_synced: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();

  // Construct rollup deltas
  // Wrap previous snapshots into Plaid-like shape to reuse delta builder
  const prevAugmented = new Map();
  prevMap.forEach((v, k) => {
    prevAugmented.set(k, { transaction_id: k, ...v });
  });
  const addDeltas = buildAddDeltas(keepAdd);
  const modDeltas = buildModifiedDeltas(keepMod, prevAugmented);
  const remDeltas = buildRemovedDeltas(removed, prevAugmented);
  const deltas = [...addDeltas, ...modDeltas, ...remDeltas];
  const deltaSummary = summarize(deltas);

  return {
    written: writeCount,
    removed: removeCount,
    cursor,
    skipped: false,
    deltas,
    deltaSummary,
  };
}

// ---------- Handler ----------
export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }
  if (event.httpMethod !== 'POST') {
    return bad(405, 'Method not allowed. Use POST.');
  }

  try {
    // Auth: Firebase ID token from Authorization header
    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return bad(401, 'Missing Authorization: Bearer <FirebaseIDToken>');
    const idToken = m[1];

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded.uid;

    // Parse input
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch {}
    const month = parseMonthOrDefault(body.month);

    // Find user items
    const itemsSnap = await db.collection('users').doc(uid).collection('plaid_items').get();
    if (itemsSnap.empty) {
      return json(200, { ok: true, month, itemsProcessed: 0, txWritten: 0, txRemoved: 0, lastCursorSaved: null });
    }

    const plaid = getPlaid();
    let itemsProcessed = 0;
    let totalWritten = 0;
    let totalRemoved = 0;
    let lastCursorSaved = null;

    let allDeltas = [];
    for (const docSnap of itemsSnap.docs) {
      const res = await syncItem({ db, plaid, uid, itemDocRef: docSnap.ref, month });
      if (!res.skipped) {
        itemsProcessed++;
        totalWritten += res.written;
        totalRemoved += res.removed;
        lastCursorSaved = res.cursor || lastCursorSaved;
        if (res.deltas?.length) allDeltas = allDeltas.concat(res.deltas);
      }
    }

    // Send batched rollup deltas (single request) if any
    let rollupApplied = false; let rollupError = null;
    if (allDeltas.length) {
      try {
        // Forward same caller token (already verified) for rollup-update auth consistency
        const callerAuth = event.headers?.authorization || event.headers?.Authorization || '';
        const resp = await fetch(`${process.env.ROLLUP_FUNCTION_URL || 'http://localhost/.netlify/functions/rollup-update'}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(callerAuth ? { Authorization: callerAuth } : {}) },
          body: JSON.stringify({ userId: uid, deltas: allDeltas })
        });
        if (!resp.ok) throw new Error(`rollup-update ${resp.status}`);
        rollupApplied = true;
      } catch (e) {
        rollupError = e.message;
        console.warn('[plaid-sync] rollup apply failed', e);
      }
    }

    return json(200, {
      ok: true,
      month,
      itemsProcessed,
      txWritten: totalWritten,
      txRemoved: totalRemoved,
      lastCursorSaved,
      deltas: allDeltas.length,
      rollupApplied,
      rollupError,
    });
  } catch (err) {
    console.error('[plaid-sync] error', err);
    return bad(500, err?.message || 'Internal error');
  }
};

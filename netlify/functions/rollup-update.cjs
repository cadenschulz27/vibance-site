// netlify/functions/rollup-update.cjs
// ------------------------------------------------------------
// Accepts transaction deltas and updates rollup docs per ROLLUPS_PLAN.md
// This is a scaffold; integrate Firestore Admin SDK if running server-side
// inside Netlify with proper service account (or use existing admin wrapper).
// ------------------------------------------------------------

// Use shared firebase-admin wrapper (supports multiple env var styles)
const { auth: adminAuth, db, FieldValue } = require('../lib/firebase-admin');

function periodKeyFromDate(dateStr, periodType = 'monthly') {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) throw new Error('Bad date in delta');
  if (periodType === 'monthly') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  // Simple weekly (ISO week simplified)
  if (periodType === 'weekly') {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; // fallback monthly
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Invalid JSON' }; }
  const { userId, deltas, periodType = 'monthly', mutationId } = body;
  if (!userId || !Array.isArray(deltas)) return { statusCode: 400, body: 'Missing userId or deltas' };
  if (mutationId && typeof mutationId !== 'string') return { statusCode: 400, body: 'mutationId must be string' };

  // Verify Firebase ID token
  const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { ok:false, error: 'missing-authorization', detail: 'Provide Authorization: Bearer <FirebaseIDToken>' });
  }
  const idToken = authHeader.substring(7).trim();
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken, true);
  } catch (e) {
    return json(401, { ok:false, error: 'auth-failed', detail: e.message });
  }
  if (decoded.uid !== userId) {
    return json(403, { ok:false, error: 'token-user-mismatch', tokenUid: decoded.uid, userId });
  }

  const FV = FieldValue;

  // Idempotency (optional mutationId)
  let mutRef;
  if (mutationId) {
    mutRef = db.collection('users').doc(userId).collection('rollup_mutations').doc(mutationId);
    try {
      const existing = await mutRef.get();
      if (existing.exists) {
        const data = existing.data() || {};
        return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'duplicate-mutation', mutationId, status: data.status || 'applied' }) };
      }
  await mutRef.set({ status: 'pending', createdAt: FV.serverTimestamp() }, { merge: true });
    } catch (e) {
      return json(500, { ok:false, error: 'idempotency-check-failed', detail: e.message });
    }
  }
  const results = [];
  const rollupBatch = db.batch();
  const summary = { expense:0, income:0 };

  for (const delta of deltas) {
    try {
      const op = delta.op;
      if (!['add','update','delete'].includes(op)) throw new Error('Bad op');
      if (op === 'update' && (!delta.prev || !delta.next)) throw new Error('Update requires prev & next');
      const affected = [];
      if (op === 'add') affected.push({ rec: delta, sign: 1 });
      else if (op === 'delete') affected.push({ rec: delta, sign: -1 });
      else if (op === 'update') {
        affected.push({ rec: delta.prev, sign: -1 });
        affected.push({ rec: delta.next, sign: 1 });
      }
      for (const a of affected) {
        const r = a.rec;
        if (!r || !r.date || !r.category || !r.type) throw new Error('Missing fields');
        const key = periodKeyFromDate(r.date, periodType);
        const cat = r.category || 'Uncategorized';
        const docId = `${key}_${cat.replace(/[\s/]+/g,'-')}`;
        const ref = db.collection('users').doc(userId).collection('rollups').doc(docId);
        // Use a placeholder update (atomic increment pattern) – Firestore batched updates require doc existence check later.
        // We'll read docs after batching for existence fallback (scaffold simplification).
        const amount = Math.abs(Number(r.amount || 0)) || 0;
        if (r.type === 'expense') summary.expense += a.sign * amount;
        else summary.income += a.sign * amount;
        rollupBatch.set(ref, {
          periodKey: key,
          categoryId: cat,
          expenseTotal: r.type === 'expense' ? FV.increment(a.sign * amount) : FV.increment(0),
          incomeTotal: r.type === 'income' ? FV.increment(a.sign * amount) : FV.increment(0),
          updatedAt: FV.serverTimestamp(),
        }, { merge: true });
      }
      results.push({ ok:true, index: results.length });
    } catch (e) {
      results.push({ ok:false, error: e.message });
    }
  }

  try {
    await rollupBatch.commit();
  } catch (e) {
    if (mutationId && mutRef) {
  try { await mutRef.set({ status: 'failed', error: e.message, updatedAt: FV.serverTimestamp() }, { merge: true }); } catch (_) {}
    }
    return json(500, { ok:false, error: 'batch-commit-failed', detail: e.message });
  }

  // Update summary doc (best-effort)
  try {
    const sumKey = periodKeyFromDate(new Date(), periodType); // could refine later
    const sumRef = db.collection('users').doc(userId).collection('rollup_summaries').doc(sumKey);
    await sumRef.set({
      expenseTotal: FV.increment(summary.expense),
      incomeTotal: FV.increment(summary.income),
      net: FV.increment(summary.income - summary.expense),
      updatedAt: FV.serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    // log only
    console.warn('Summary update failed', e);
  }

  if (mutationId && mutRef) {
    try { await mutRef.set({ status: 'applied', appliedAt: FieldValue.serverTimestamp(), resultCount: results.length }, { merge: true }); } catch (_) {}
  }
  return json(200, { ok:true, results, mutationId, applied: true });
};

// Simple JSON helper with permissive CORS (similar to plaid-sync)
function json(status, data) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'OPTIONS, POST'
    },
    body: JSON.stringify(data)
  };
}

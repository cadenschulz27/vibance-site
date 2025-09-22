// netlify/functions/lib/rollup-delta.cjs
// ------------------------------------------------------------------
// Build rollup deltas (add / update / delete) from Plaid transaction
// arrays. Amount polarity assumptions:
//  - Plaid expense (outflow) amounts are positive in data.added[].amount
//  - Income (inflow) may appear as negative or positive depending on
//    institution; heuristic: negative or `transaction_type==='credit'`
// Canonical rule for budgets: store positive amount + type field.
// ------------------------------------------------------------------

function classify(tx) {
  if (!tx) return { type: 'expense', amount: 0 };
  const raw = Number(tx.amount || 0);
  // Heuristic: negative or credit-like metadata => income
  const isIncome = raw < 0 || /credit/i.test(tx.transaction_type || '') || (tx.personal_finance_category && /income|payroll|salary|refund/i.test(JSON.stringify(tx.personal_finance_category).toLowerCase()));
  return { type: isIncome ? 'income' : 'expense', amount: Math.abs(raw) };
}

function categoryFrom(tx) {
  if (!tx) return 'Uncategorized';
  if (Array.isArray(tx.category) && tx.category.length) return tx.category[0];
  if (tx.personal_finance_category && tx.personal_finance_category.primary) return tx.personal_finance_category.primary;
  return 'Uncategorized';
}

function coreFields(tx) {
  return {
    date: tx.date || tx.authorized_date || new Date().toISOString().slice(0,10),
    category: categoryFrom(tx),
    ...classify(tx),
  };
}

function buildAddDeltas(added) {
  return added.map(tx => ({ op: 'add', ...coreFields(tx) }));
}

// Modified transactions: we only get 'new' shapes; need previous snapshot
// Caller must supply map of previous transaction states if diff desired.
function buildModifiedDeltas(modified, prevMap) {
  const out = [];
  for (const tx of modified) {
    const prev = prevMap.get(tx.transaction_id);
    if (!prev) {
      // treat as add if we lack previous (should not happen if map complete)
      out.push({ op: 'add', ...coreFields(tx) });
      continue;
    }
    const prevCore = coreFields(prev);
    const nextCore = coreFields(tx);
    // If nothing changed relevant to rollup skip
    if (prevCore.type === nextCore.type && prevCore.amount === nextCore.amount && prevCore.category === nextCore.category && prevCore.date === nextCore.date) continue;
    out.push({ op: 'update', prev: prevCore, next: nextCore });
  }
  return out;
}

function buildRemovedDeltas(removed, prevMap) {
  const out = [];
  for (const r of removed) {
    const prev = prevMap.get(r.transaction_id || r);
    if (!prev) continue; // cannot build deletion without previous context
    out.push({ op: 'delete', ...coreFields(prev) });
  }
  return out;
}

function summarize(deltas) {
  return deltas.reduce((acc, d) => {
    if (d.op === 'add') {
      acc[d.type] = (acc[d.type] || 0) + d.amount;
    } else if (d.op === 'delete') {
      acc[d.type] = (acc[d.type] || 0) - d.amount;
    } else if (d.op === 'update') {
      const pt = d.prev.type; const nt = d.next.type;
      if (pt === nt) {
        acc[nt] = (acc[nt] || 0) + (d.next.amount - d.prev.amount);
      } else {
        acc[pt] = (acc[pt] || 0) - d.prev.amount;
        acc[nt] = (acc[nt] || 0) + d.next.amount;
      }
    }
    return acc;
  }, { expense:0, income:0 });
}

module.exports = {
  buildAddDeltas, buildModifiedDeltas, buildRemovedDeltas, summarize, classify, categoryFrom
};

# Budget Rollup Architecture (Draft)

## Goals
- O( B ) reads for budget view where B = number of active budget categories for a period.
- Minimize repeated scanning of full transaction collections.
- Support real-time-ish updates after Plaid syncs or manual edits.

## Firestore Structure
```
users/{uid}/rollups/{periodKey}_{categoryId}
{
  periodKey: '2025-09' | '2025-W38' | 'C2025-09-01_2025-09-15',
  categoryId: 'Groceries',
  expenseTotal: number,   // accumulated positive amount
  incomeTotal: number,    // accumulated positive amount
  txCountExpense: number,
  txCountIncome: number,
  lastTxAt: Timestamp,    // most recent transaction date inside period
  updatedAt: Timestamp,
  version: 1
}
```

Optional per-period aggregate doc (all categories) for dashboard:
```
users/{uid}/rollup_summaries/{periodKey}
{ expenseTotal, incomeTotal, net, updatedAt }
```

## Period Keys
Use helpers in `public/shared/period.js` (`monthlyKey`, `weeklyKey`, `customKey`). Budget docs will store `periodType` + `periodKey`. Rollups derived solely from `periodKey + categoryId`.

## Update Triggers
1. Manual create/update/delete
2. Override create/update (could change amount, category, archived flag, date)
3. Plaid sync (batch added/modified/removed)

### Strategy
- Client emits a batched delta list to a Netlify function when large sync finishes (already have pattern in `plaid-sync.js`).
- Small user actions (manual entry, override) can directly call a lightweight Netlify function `rollup-update` with a single delta to avoid race conditions.

## Delta Payload Shape (to Function)
```jsonc
{
  "userId": "abc",
  "deltas": [
    { "op": "add", "type": "expense", "amount": 23.45, "category": "Groceries", "date": "2025-09-22" },
    { "op": "update", "prev": {"type":"expense","amount":50,"category":"Dining","date":"2025-09-21"}, "next": {"type":"expense","amount":42,"category":"Groceries","date":"2025-09-21"} },
    { "op": "delete", "type":"income", "amount": 1200, "category":"Salary", "date":"2025-09-15" }
  ]
}
```

## Function Logic (Pseudo)
1. Group deltas by (periodKey, categoryId).
2. For each group, compute net change to `expenseTotal` and/or `incomeTotal` with validation (no negative results).
3. Perform transactional update (or batched with retry) on each rollup doc.
4. Update / create per-period summary doc incrementally.

## Handling Updates
Update delta example (prev vs next):
- Subtract prev from previous category rollup
- Add next to new category rollup (may be same or different)
If date moves across period boundary, adjust both old and new period rollups.

## Idempotency
Include a `mutationId` (UUID) per batch stored in a `users/{uid}/rollup_mutations/{mutationId}` doc to skip duplicates.

## Concurrency Considerations
Multiple simultaneous sync operations rare; optimistic batched writes acceptable. If contention becomes an issue, move to Firestore transactions for each doc group.

## Client Consumption
Budget view loads budgets, then for each: reads `rollups/{periodKey}_{categoryId}` (missing doc => treat as zeros). Optionally attaches listener for live updates.

## Backfill Script
Admin Netlify function `admin-backfill-rollups.cjs`:
1. Enumerate historical periods in range (e.g., last 12 months).
2. For each period, query transactions once (expense + income) grouped client/server side.
3. Write initial rollup docs.

## Open Questions / Next Iteration
- Should we maintain per-category daily breakdown for calendar heat map? (Could add `users/{uid}/rollups_daily/{YYYY-MM-DD}_{category}` docs later.)
- Consider storing `firstTxAt` for aging analytics.
- Evaluate cost: each delta => 1 read + 1 write (doc fetch before update) if using transaction.

## Next Steps Implementation Order
1. Create Netlify function `rollup-update.cjs` (accepts deltas; updates docs).
2. Hook manual create/update/archive + overrides to send single delta.
3. Extend Plaid sync function to batch send deltas after sync.
4. Budget tab: fetch rollups + display progress bars.
5. Add projections (client) using totals + elapsed days.

## Appendix: Plaid Sync Integration
Server-side (`plaid-sync.js`):
- Collects added, modified, removed transactions for each item.
- Fetches previous snapshots for modified/removed to produce accurate update/delete deltas.
- Uses `netlify/functions/lib/rollup-delta.cjs` to build canonical deltas, then posts a single batched request to `rollup-update.cjs`.
- Response includes `rollupApplied: true|false` and delta count for client logging.

Client (`expenses.js` / `income.js`):
- Logs when server confirms rollup application; no duplicate client delta emission needed.
- Manual and override operations still emit direct deltas for immediate update between sync cycles.

Idempotency (Future):
- Add `mutationId` per sync (e.g., concatenation of itemId + last cursor) to skip duplicate delta batch applications.
- Track executed mutationIds in `users/{uid}/rollup_mutations`.


// Tests for rollup-delta.cjs
const { buildAddDeltas, buildModifiedDeltas, buildRemovedDeltas, summarize, classify, categoryFrom } = require('../lib/rollup-delta.cjs');

describe('classify', () => {
  it('classifies positive amount as expense', () => {
    expect(classify({ amount: 42 })).toEqual({ type: 'expense', amount: 42 });
  });
  it('classifies negative amount as income', () => {
    expect(classify({ amount: -15 })).toEqual({ type: 'income', amount: 15 });
  });
  it('classifies credit transaction_type as income', () => {
    expect(classify({ amount: 100, transaction_type: 'CREDIT' })).toEqual({ type: 'income', amount: 100 });
  });
  it('detects personal finance income category', () => {
    expect(classify({ amount: 200, personal_finance_category: { primary: 'INCOME_PAYROLL' } })).toEqual({ type: 'income', amount: 200 });
  });
});

describe('categoryFrom', () => {
  it('uses first category array element', () => {
    expect(categoryFrom({ category: ['Food', 'Groceries'] })).toBe('Food');
  });
  it('falls back to personal finance primary', () => {
    expect(categoryFrom({ personal_finance_category: { primary: 'TRAVEL_AIR' } })).toBe('TRAVEL_AIR');
  });
  it('defaults to Uncategorized', () => {
    expect(categoryFrom({})).toBe('Uncategorized');
  });
});

describe('buildAddDeltas', () => {
  it('builds add deltas with core fields', () => {
    const deltas = buildAddDeltas([{ amount: 10, date: '2025-01-02', category: ['Food'] }]);
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ op: 'add', amount: 10, type: 'expense', category: 'Food', date: '2025-01-02' });
  });
});

describe('buildModifiedDeltas', () => {
  it('creates update delta when core fields change', () => {
    const prevMap = new Map();
    prevMap.set('tx1', { transaction_id: 'tx1', amount: 10, date: '2025-01-01', category: ['Food'] });
    const modified = [{ transaction_id: 'tx1', amount: 12, date: '2025-01-01', category: ['Food'] }];
    const deltas = buildModifiedDeltas(modified, prevMap);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('update');
    expect(deltas[0].prev.amount).toBe(10);
    expect(deltas[0].next.amount).toBe(12);
  });
  it('skips if no relevant change', () => {
    const prevMap = new Map();
    prevMap.set('tx1', { transaction_id: 'tx1', amount: 10, date: '2025-01-01', category: ['Food'] });
    const modified = [{ transaction_id: 'tx1', amount: 10, date: '2025-01-01', category: ['Food'] }];
    const deltas = buildModifiedDeltas(modified, prevMap);
    expect(deltas).toHaveLength(0);
  });
  it('treats missing prev as add', () => {
    const prevMap = new Map();
    const modified = [{ transaction_id: 'txX', amount: 5, date: '2025-01-02', category: ['Misc'] }];
    const deltas = buildModifiedDeltas(modified, prevMap);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('add');
  });
  it('detects type flip expense->income', () => {
    const prevMap = new Map();
    prevMap.set('tx1', { transaction_id: 'tx1', amount: 25, date: '2025-01-01', category: ['Misc'] });
    const modified = [{ transaction_id: 'tx1', amount: -30, date: '2025-01-01', category: ['Misc'] }];
    const deltas = buildModifiedDeltas(modified, prevMap);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('update');
    expect(deltas[0].prev.type).toBe('expense');
    expect(deltas[0].next.type).toBe('income');
  });
});

describe('buildRemovedDeltas', () => {
  it('creates delete delta when previous exists', () => {
    const prevMap = new Map();
    prevMap.set('tx1', { transaction_id: 'tx1', amount: 10, date: '2025-01-01', category: ['Food'] });
    const removed = [{ transaction_id: 'tx1' }];
    const deltas = buildRemovedDeltas(removed, prevMap);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].op).toBe('delete');
  });
  it('skips if no previous snapshot', () => {
    const prevMap = new Map();
    const removed = [{ transaction_id: 'txX' }];
    const deltas = buildRemovedDeltas(removed, prevMap);
    expect(deltas).toHaveLength(0);
  });
});

describe('summarize', () => {
  it('sums add/delete/update correctly including type flips', () => {
    const deltas = [
      { op: 'add', type: 'expense', amount: 10, category: 'Food', date: '2025-01-01' },
      { op: 'add', type: 'income', amount: 50, category: 'Salary', date: '2025-01-01' },
      { op: 'delete', type: 'expense', amount: 3, category: 'Food', date: '2025-01-02' },
      { op: 'update', prev: { type: 'expense', amount: 5, category: 'Misc', date: '2025-01-02' }, next: { type: 'expense', amount: 8, category: 'Misc', date: '2025-01-02' } },
      { op: 'update', prev: { type: 'expense', amount: 7, category: 'Misc', date: '2025-01-02' }, next: { type: 'income', amount: 7, category: 'Misc', date: '2025-01-02' } }
    ];
    const s = summarize(deltas);
    expect(s.expense).toBe(10 - 3 + 3 - 7); // 3 from expense->expense delta (5->8), minus 7 from flip removal
    expect(s.income).toBe(50 + 7); // original income add + flip addition
  });
});

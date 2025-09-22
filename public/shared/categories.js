// public/shared/categories.js
// ------------------------------------------------------------
// Central category definitions & helpers for consistent mapping
// ------------------------------------------------------------

export const BASE_CATEGORIES = [
  'Housing','Utilities','Groceries','Dining','Transport','Travel','Health','Insurance','Subscriptions',
  'Shopping','Entertainment','Education','Gifts','Fees','Taxes','Savings','Investments','Debt','Income','Other','Uncategorized'
];

// Simple normalization (case-insensitive match to base list)
export function normalizeCategory(raw) {
  if (!raw) return 'Uncategorized';
  const s = String(raw).trim();
  if (!s) return 'Uncategorized';
  const lower = s.toLowerCase();
  const hit = BASE_CATEGORIES.find(c => c.toLowerCase() === lower);
  return hit || s; // allow dynamic user-added categories
}

// Placeholder for Plaid -> internal mapping (extend later)
const PLAID_MAP = new Map([
  ['rent','Housing'],
  ['mortgage','Housing'],
  ['grocery','Groceries'],
  ['restaurant','Dining'],
  ['fast food','Dining'],
  ['subscription','Subscriptions'],
  ['transportation','Transport'],
]);

export function mapPlaidCategories(arrayOrString) {
  if (!arrayOrString) return 'Uncategorized';
  const arr = Array.isArray(arrayOrString) ? arrayOrString : [arrayOrString];
  for (const token of arr) {
    const key = String(token || '').toLowerCase();
    if (PLAID_MAP.has(key)) return PLAID_MAP.get(key);
  }
  // fallback to the first normalized token
  return normalizeCategory(arr[0]);
}

export default { BASE_CATEGORIES, normalizeCategory, mapPlaidCategories };

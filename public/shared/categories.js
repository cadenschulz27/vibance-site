// public/shared/categories.js
// ------------------------------------------------------------
// Central category definitions & helpers for consistent mapping
// ------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'Housing','Utilities','Groceries','Dining','Transport','Travel','Health','Insurance','Subscriptions',
  'Shopping','Entertainment','Education','Gifts','Fees','Taxes','Savings','Investments','Debt','Other','Uncategorized'
];

export const INCOME_CATEGORIES = [
  'Salary','Paycheck','Bonus','Commission','Interest','Dividend','Investments','Rental income','Side hustle',
  'Refund','Gift','Reimbursement','Social security','Pension','Other'
];

export const BASE_CATEGORIES = [...new Set([...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES])];
export const UNIVERSAL_CATEGORIES = BASE_CATEGORIES;

export function normalizeCategoryInput(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

// Simple normalization (case-insensitive match to base list)
export function normalizeCategory(raw) {
  if (!raw) return 'Uncategorized';
  const s = normalizeCategoryInput(raw);
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

export function ensureCategoryDatalist(id = 'category-list', categories = UNIVERSAL_CATEGORIES) {
  if (typeof document === 'undefined') return null;
  const targetId = id || 'category-list';
  const unique = Array.from(new Set((categories || []).map(normalizeCategoryInput).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b));
  const markup = unique
    .map(cat => `<option value="${cat.replace(/"/g, '&quot;')}"></option>`)
    .join('');

  let dl = document.getElementById(targetId);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = targetId;
    document.body.appendChild(dl);
  }
  dl.innerHTML = markup;
  return dl;
}

export function buildCategoryOptionList(base = [], current = '', auto = '') {
  const options = [];
  const trimmedCurrent = normalizeCategoryInput(current);
  const trimmedAuto = normalizeCategoryInput(auto);

  options.push({ value: '', label: trimmedAuto ? `Auto: ${trimmedAuto}` : 'Uncategorized' });

  const seen = new Set(['']);
  const addOption = (value, label = value) => {
    const trimmed = normalizeCategoryInput(value);
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    options.push({ value: trimmed, label: label || trimmed });
  };

  if (trimmedCurrent) addOption(trimmedCurrent);
  (base || []).forEach((entry) => addOption(entry));

  options.push({ value: '__custom', label: 'Custom…' });
  return options;
}

export default {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  BASE_CATEGORIES,
  UNIVERSAL_CATEGORIES,
  normalizeCategory,
  normalizeCategoryInput,
  ensureCategoryDatalist,
  buildCategoryOptionList,
  mapPlaidCategories,
};

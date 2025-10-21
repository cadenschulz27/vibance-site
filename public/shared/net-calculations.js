// public/shared/net-calculations.js
// Consolidated net calculation logic used by Net, Expenses, and Income tabs
// Ensures consistency across all pages

import { auth, db } from '../api/firebase.js';
import {
  collection, getDocs, query, orderBy, where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/**
 * Load all transactions for a user within a date range
 * Includes both Plaid transactions and manual entries
 */
export async function loadTransactionsForRange(uid, startDate, endDate) {
  if (!uid) return [];
  
  try {
    let allTransactions = [];
    
    // Load Plaid transactions
    try {
      const itemsRef = collection(db, 'users', uid, 'plaid_items');
      const itemsSnap = await getDocs(itemsRef);
      
      for (const itemDoc of itemsSnap.docs) {
        const itemId = itemDoc.id;
        const txRef = collection(db, 'users', uid, 'plaid_items', itemId, 'transactions');
        
        try {
          const txSnap = await getDocs(query(txRef, orderBy('date', 'desc')));
          txSnap.forEach(doc => {
            const data = doc.data();
            const txDate = parseDate(data.date);
            
            if (txDate >= startDate && txDate <= endDate) {
              allTransactions.push({
                id: doc.id,
                itemId,
                source: 'plaid',
                ...data,
                _epoch: txDate.getTime(),
                _date: txDate,
              });
            }
          });
        } catch (e) {
          console.warn(`[net-calculations] Failed to load transactions for item ${itemId}:`, e);
        }
      }
    } catch (e) {
      console.warn('[net-calculations] Failed to load Plaid items:', e);
    }
    
    // Load manual entries
    try {
      const manualRef = collection(db, 'users', uid, 'manual_entries');
      const manualSnap = await getDocs(manualRef);
      
      manualSnap.forEach(doc => {
        const data = doc.data() || {};
        const txDate = parseDate(data.date);
        
        if (txDate >= startDate && txDate <= endDate) {
          const type = data.type || 'expense';
          // Convert to Plaid polarity: negative for income, positive for expense
          const amount = type === 'income' ? -Math.abs(Number(data.amount || 0)) : Math.abs(Number(data.amount || 0));
          
          allTransactions.push({
            id: doc.id,
            itemId: 'manual',
            source: 'manual',
            amount,
            date: data.date,
            name: data.name || data.description || (type === 'income' ? 'Manual income' : 'Manual expense'),
            merchant_name: '',
            category: Array.isArray(data.category) ? data.category : [data.category || 'Uncategorized'],
            personal_finance_category: {},
            categoryUser: data.category || '',
            categoryAuto: '',
            iso_currency_code: data.currency || 'USD',
            pending: false,
            archived: !!data.archived,
            notes: data.notes || '',
            manual: true,
            _epoch: txDate.getTime(),
            _date: txDate,
            raw: data,
          });
        }
      });
    } catch (e) {
      console.warn('[net-calculations] Failed to load manual entries:', e);
    }
    
    return allTransactions;
  } catch (error) {
    console.warn('[net-calculations] Failed to load transactions:', error);
    return [];
  }
}

/**
 * Parse a date string or Timestamp to a Date object
 */
export function parseDate(value) {
  if (!value) return new Date(0);
  
  if (typeof value?.toDate === 'function') {
    return value.toDate();
  }
  
  if (typeof value === 'string') {
    // ISO string or YYYY-MM-DD format
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  
  if (typeof value === 'number') {
    return new Date(value);
  }
  
  return new Date(0);
}

/**
 * Parse a local date string (YYYY-MM-DD) to epoch
 */
export function parseLocalDateEpoch(str) {
  if (!str) return 0;
  if (typeof str !== 'string') {
    const d = (typeof str?.toDate === 'function') ? str.toDate() : new Date(str);
    const t = d?.getTime?.() ?? NaN;
    return Number.isNaN(t) ? 0 : t;
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
  }
  const t = Date.parse(str);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Get transactions as income (amount < 0 in Plaid polarity means income)
 */
export function getIncomeTransactions(transactions) {
  return transactions.filter(tx => {
    const amount = Number(tx.amount || 0);
    return amount < 0; // Negative amount = income
  }).map(tx => ({
    ...tx,
    amount: Math.abs(tx.amount), // Make positive for display
  }));
}

/**
 * Get transactions as expenses (amount > 0 in Plaid polarity means expense)
 */
export function getExpenseTransactions(transactions) {
  return transactions.filter(tx => {
    const amount = Number(tx.amount || 0);
    return amount > 0; // Positive amount = expense
  });
}

/**
 * Calculate aggregated totals by month
 */
export function aggregateByMonth(transactions) {
  const monthMap = new Map();
  
  transactions.forEach(tx => {
    const txDate = parseDate(tx.date);
    const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`;
    
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        month: monthKey,
        income: 0,
        expense: 0,
        count: 0,
        transactions: [],
      });
    }
    
    const month = monthMap.get(monthKey);
    const amount = Math.abs(Number(tx.amount || 0));
    
    if (tx.amount < 0) {
      month.income += amount;
    } else if (tx.amount > 0) {
      month.expense += amount;
    }
    
    month.count += 1;
    month.transactions.push(tx);
  });
  
  // Sort by month descending
  return Array.from(monthMap.values()).sort((a, b) => b.month.localeCompare(a.month));
}

/**
 * Calculate totals for a transaction set
 */
export function calculateTotals(transactions) {
  const totals = {
    income: 0,
    expense: 0,
    net: 0,
  };
  
  transactions.forEach(tx => {
    const amount = Math.abs(Number(tx.amount || 0));
    
    if (tx.amount < 0) {
      totals.income += amount;
    } else if (tx.amount > 0) {
      totals.expense += amount;
    }
  });
  
  totals.net = totals.income - totals.expense;
  return totals;
}

/**
 * Aggregate transactions by category
 */
export function aggregateByCategory(transactions) {
  const categoryMap = new Map();
  
  transactions.forEach(tx => {
    const category = (tx.categoryUser || tx.categoryAuto || 'Uncategorized') || 'Uncategorized';
    
    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        name: category,
        income: 0,
        expense: 0,
        count: 0,
        total: 0,
      });
    }
    
    const cat = categoryMap.get(category);
    const amount = Math.abs(Number(tx.amount || 0));
    
    if (tx.amount < 0) {
      cat.income += amount;
    } else if (tx.amount > 0) {
      cat.expense += amount;
    }
    
    cat.count += 1;
    cat.total += amount;
  });
  
  // Sort by total descending
  return Array.from(categoryMap.values()).sort((a, b) => b.total - a.total);
}

/**
 * Apply filters to transactions (consistent with Expenses/Income pages)
 */
export function filterTransactions(transactions, filters = {}) {
  let filtered = [...transactions];
  
  const {
    account,
    startDate,
    endDate,
    search,
    category,
    minAmount,
    maxAmount,
    archived,
    type, // 'income' or 'expense'
  } = filters;
  
  if (account) {
    filtered = filtered.filter(tx => tx.itemId === account);
  }
  
  if (startDate instanceof Date) {
    const startEpoch = startDate.getTime();
    filtered = filtered.filter(tx => {
      const txDate = parseDate(tx.date);
      return txDate.getTime() >= startEpoch;
    });
  }
  
  if (endDate instanceof Date) {
    const endEpoch = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999).getTime();
    filtered = filtered.filter(tx => {
      const txDate = parseDate(tx.date);
      return txDate.getTime() <= endEpoch;
    });
  }
  
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(tx => {
      const hay = `${(tx.name || '').toLowerCase()} ${(tx.merchant || '').toLowerCase()} ${(tx.categoryAuto || '').toLowerCase()} ${(tx.categoryUser || '').toLowerCase()} ${(tx.institution_name || '').toLowerCase()}`;
      return hay.includes(q);
    });
  }
  
  if (category) {
    const cat = category.toLowerCase();
    filtered = filtered.filter(tx => {
      const txCat = (tx.categoryUser || tx.categoryAuto || '');
      return txCat.toLowerCase().includes(cat);
    });
  }
  
  if (typeof minAmount === 'number' && !Number.isNaN(minAmount)) {
    filtered = filtered.filter(tx => Math.abs(tx.amount) >= minAmount);
  }
  
  if (typeof maxAmount === 'number' && !Number.isNaN(maxAmount)) {
    filtered = filtered.filter(tx => Math.abs(tx.amount) <= maxAmount);
  }
  
  if (typeof archived === 'boolean') {
    filtered = filtered.filter(tx => tx.archived === archived);
  }
  
  if (type === 'income') {
    filtered = filtered.filter(tx => tx.amount < 0);
  } else if (type === 'expense') {
    filtered = filtered.filter(tx => tx.amount > 0);
  }
  
  return filtered;
}

# Net Insight Calculations - Fix Summary

## Problem
The net insight calculations in the Net tab were not properly pulling data from the Expenses and Income tabs, leading to inconsistent calculations and potentially incorrect financial metrics. Additionally, manual entries were not being included in the calculations.

## Solution
Implemented a consolidated calculation system that ensures all three tabs (Net, Expenses, Income) use the same data sources and calculation logic, including both Plaid transactions and manual entries.

### Changes Made

#### 1. Created `public/shared/net-calculations.js`
A new shared module that provides standardized functions for:
- **loadTransactionsForRange()** - Loads all transactions (Plaid + manual entries) for a user within a date range from Firestore
- **parseDate()** - Consistently parses date values (Timestamp, string, number)
- **aggregateByMonth()** - Groups transactions by month for monthly summaries
- **aggregateByCategory()** - Groups transactions by category for category-based analysis
- **calculateTotals()** - Calculates income, expense, and net totals
- **filterTransactions()** - Applies consistent filters (account, date, search, category, amount, archive status)
- **getIncomeTransactions()** and **getExpenseTransactions()** - Filters by transaction type

#### 2. Updated `public/Net/net.js`
- **Import consolidated functions** from net-calculations.js
- **Modified loadRange()** function to:
  - Load transactions directly from Firestore using the new shared module
  - Include both Plaid transactions AND manual entries in calculations
  - Use aggregateByMonth() and aggregateByCategory() for calculations
  - Fall back to rollup data only if no transactions are found
  - Ensure calculations match what Expenses and Income tabs compute
  - Properly handle date ranges for accurate monthly lookbacks

#### 3. Enhanced `public/Expenses/expenses.js`
- Added **VIBANCE_EXPENSES_API** global object that exposes:
  - getCurrentExpensesTotal() - Get current filtered expenses total
  - getCurrentIncome() - Returns 0 (expenses tab doesn't show income)
  - getCurrentTransactions() - Get current filtered transactions
  - getAllTransactions() - Get all loaded transactions
- This allows other tabs to access current calculation state

#### 4. Enhanced `public/Income/income.js`
- Added **VIBANCE_INCOME_API** global object that exposes:
  - getCurrentIncomeTotal() - Get current filtered income total
  - getCurrentExpenses() - Returns 0 (income tab doesn't show expenses)
  - getCurrentTransactions() - Get current filtered transactions
  - getAllTransactions() - Get all loaded transactions
- This allows other tabs to access current calculation state

### Key Improvements

1. **Comprehensive Data** - Now includes both Plaid transactions AND manual income/expense entries
2. **Consistency** - All three tabs now use the same transaction data from Firestore
3. **Accuracy** - Calculations are based on actual transactions, not just rollups
4. **Synchronization** - The Net tab now pulls live data directly instead of relying on cached rollups
5. **Fallback Strategy** - If no transactions exist, the system falls back to Firestore rollup data
6. **Cross-Tab Communication** - Expenses and Income tabs now expose their current state via window objects

### Data Flow

**Before (Unreliable):**
- Net tab → Firestore rollups → Fallback to transaction calculation (may differ from Expenses/Income)
- Manual entries not included

**After (Complete & Consistent):**
- Net tab → Firestore transactions (Plaid + manual) → aggregateByMonth() → Monthly summaries
- All calculations use the same underlying transaction data including manual entries

### Manual Entry Handling

The `loadTransactionsForRange()` function now:
1. Loads all Plaid transactions from `plaid_items/{itemId}/transactions`
2. Loads all manual entries from `manual_entries` collection
3. Converts manual entries to Plaid polarity (negative = income, positive = expense)
4. Filters by date range
5. Returns combined transaction array

This ensures manual income and expenses are fully integrated into:
- Monthly aggregations
- Category aggregations  
- Net calculations
- Insights and analytics

### Usage

The Net tab now automatically uses the consolidated calculation system when loading data. The calculation happens in the `loadRange()` function which:

1. Determines the date range based on selected months (6, 12, etc.)
2. Calls `loadTransactionsForRange(UID, startDate, endDate)` to fetch all transactions (Plaid + manual)
3. Uses `aggregateByMonth()` to group by month
4. Uses `aggregateByCategory()` to group by category
5. Computes stats using the same logic as before, but with verified data

### Testing Recommendations

1. Verify net calculations match between tabs when viewing the same date range
2. Test with both Plaid and manual transactions
3. Test with archived transactions (should be excluded)
4. Verify category aggregations are correct across all tabs
5. Test the 6-month and 12-month views to ensure proper date range handling
6. Ensure manual income entries appear in totals
7. Ensure manual expense entries appear in totals

### Files Modified

- `/public/shared/net-calculations.js` - NEW (includes manual entries support)
- `/public/Net/net.js` - Updated loadRange() and imports
- `/public/Expenses/expenses.js` - Added VIBANCE_EXPENSES_API
- `/public/Income/income.js` - Added VIBANCE_INCOME_API

# Net Insight Statistics Redesign

## Summary of Changes

The net insight calculations have been redesigned to provide more meaningful and actionable financial metrics. Old generic statistics have been replaced with specific financial ratios and insights.

## Removed Statistics

- ❌ `trendSlope` - Linear trend calculation (removed for simplicity)
- ❌ `trendIntercept` - Linear trend calculation (removed for simplicity)
- ❌ `projectedNet` - Linear projection (removed)
- ❌ `ratio` as income/expense multiplier - Too abstract for users
- ❌ `netStdDev` as primary metric - Kept as calculation but not displayed

## New Statistics

### Financial Ratios (Most Important)

1. **savingsRate** - What percentage of your income you keep (net / income)
   - Shows financial health and discipline
   - Displayed in "Average monthly net" metric card
   - Formula: `(income - expense) / income`

2. **expenseRatio** - What percentage of income goes to expenses (expense / income)
   - Shows spending efficiency
   - Displayed in "Income vs expenses" metric card
   - Formula: `expense / income`

3. **incomeToExpenseRatio** - Kept but deprecated in display (income / expense)
   - Used internally for insights

### Volatility Metrics (Normalized)

1. **incomeVolatility** - Income consistency (standard deviation / average)
   - 0 = perfectly consistent, higher = less predictable

2. **expenseVolatility** - Expense consistency (standard deviation / average)
   - 0 = perfectly consistent, higher = less predictable

3. **consistencyScore** (0-100) - Overall cash flow predictability
   - 80+ = Highly consistent (easy to budget)
   - 60-79 = Moderate (plan for swings)
   - <40 = High volatility (set emergency buffers)

### Expanded Month Tracking

Now tracking extremes:
- `highestIncomeMonth` / `lowestIncomeMonth`
- `highestExpenseMonth` / `lowestExpenseMonth`
- `highestNetMonth` / `lowestNetMonth`

### Category Analysis

- **largestExpensePct** - Largest expense category as percentage of total
  - Helps identify spending concentration

## Updated Displays

### Metric Cards

| Metric | Label | Before | After |
|--------|-------|--------|-------|
| 1 | Average monthly net | Average across period | What you keep after expenses (shows savings rate %) |
| 2 | Income captured | Total & average | Income total & average |
| 3 | Expenses paid | Expense total & average | Expense total & average |
| 4 | Income vs expenses | Net margin ratio (x) | Expense ratio (% of income spent) |

### Narrative Insights

**Improved Messages:**

- **Summary**: Now includes savings rate assessment
  - "You're saving 25% of income—solid financial discipline"
  - "12% of income is being saved; look for optimization opportunities"
  
- **Volatility**: Now uses consistency score instead of raw standard deviation
  - "Income and expense patterns are highly consistent—easy to budget"
  - "Moderate variability in cash flow; plan for swings"
  - "High cash flow volatility detected—set larger emergency buffers"

- **Actions**: Now uses largest expense percentage for recommendations
  - "Groceries is 32% of spending—consider reducing this category"

## Files Modified

- `/public/Net/net-logic.mjs`
  - Updated `computeStats()` to calculate new metrics
  - Updated `composeNarrative()` to use meaningful statistics
  - Removed unnecessary projections

- `/public/Net/net.js`
  - Updated `renderHighlights()` to display savings rate and expense ratio
  - Better metric labels

- `/public/Net/net.html`
  - Updated metric card labels and captions
  - Better descriptions of what each metric means

## Key Improvements

✅ **More Actionable** - Percentages and ratios users understand better
✅ **Normalized** - All metrics normalized to income for fair comparison
✅ **Consistent** - Simplicity removes confusion
✅ **Practical** - Consistency score helps with budgeting decisions
✅ **Comprehensive** - Tracks extremes (highest/lowest months)

## Usage

The Net tab automatically uses these new statistics. All calculations happen transparently in `computeStats()` and display in the UI through `renderHighlights()` and narrative composition.

### Example Output

**Current:** "You have $2,500 net this month"
**Before:** "2.1x income-to-expense ratio, net margin 33%"
**After:** "You're saving 33% of income—solid financial discipline. Groceries is 28% of spending."

# Bug Fixes - Net Insight Statistics

## Issues Fixed

### 1. **TypeError: Cannot read properties of undefined (reading 'toFixed')**
   - **Cause**: The `buildInsights()` function was trying to access `stats.ratio` but the new stats object uses `stats.incomeToExpenseRatio` instead
   - **Fix**: Updated reference from `stats.ratio` to `stats.incomeToExpenseRatio`
   - **Impact**: Prevented crash when rendering insights

### 2. **Removed Undefined Property References**
   - **Removed**: 
     - `stats.projectedNet` - No longer calculated (trend projection removed)
     - `stats.trendSlope` - No longer calculated
     - `stats.trendIntercept` - No longer calculated
   - **Fixed Locations**:
     - `buildInsights()` - Removed forecast insight based on projectedNet
     - `composeNarrative()` - Removed projection commentary
   - **Replacement**: Added consistency score-based volatility insights instead

### 3. **Property Name Updates in buildInsights()**
   - Changed `stats.netMargin` to `stats.savingsRate` in insight copy
   - Updated insight messaging to use savings rate instead of margin

## Code Changes

### File: `/public/Net/net-logic.mjs`

1. **buildInsights()** - Line ~335
   ```javascript
   // Before
   if (stats.ratio !== null) {
     const ratioTone = stats.ratio >= 1 ? 'positive' : 'warning';
     const ratioLabel = stats.ratio === Infinity ? '∞' : `${stats.ratio.toFixed(...)}x`;
   }
   
   // After
   if (stats.incomeToExpenseRatio !== null) {
     const ratioTone = stats.incomeToExpenseRatio >= 1 ? 'positive' : 'warning';
     const ratioLabel = stats.incomeToExpenseRatio === Infinity ? '∞' : `${stats.incomeToExpenseRatio.toFixed(...)}x`;
   }
   ```

2. **buildInsights()** - Replaced projection forecast
   ```javascript
   // Before
   if (Number.isFinite(stats.projectedNet)) { ... }
   
   // After
   if (stats.consistencyScore !== undefined) {
     if (stats.consistencyScore > 80) { ... }
     else if (stats.consistencyScore < 40) { ... }
   }
   ```

3. **composeNarrative()** - Removed projection commentary
   ```javascript
   // Removed
   if (prefs.forecasts && Number.isFinite(stats.projectedNet)) {
     parts.push(`Trajectory signals a ${trendWord} ...`);
   }
   
   // Updated actions section
   if (stats.largestExpensePct > 0.25) {
     parts.push(`${focusCategory.name} is ${formatPercent(...)} of spending...`);
   }
   ```

## Testing

✅ No more undefined property errors
✅ Income to expense ratio displays correctly
✅ Savings rate shows in insights
✅ Consistency score used for volatility insights
✅ All stats properties referenced in code are defined in computeStats()

## Related Files
- `/public/Net/net.js` - renderHighlights() already using correct properties
- `/public/Net/net-logic.mjs` - computeStats() returns new property names

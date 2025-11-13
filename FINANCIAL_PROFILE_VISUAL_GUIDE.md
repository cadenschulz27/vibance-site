# Financial Profile Page - Visual Guide

## Page Layout

### Header Section
```
┌─────────────────────────────────────────────────────────────┐
│ [FINANCIAL PROFILE]                                          │
│                                                               │
│ Your financial story, personalized                           │
│                                                               │
│ [Dynamic identity blurb about the user's work situation]     │
│                                                               │
│ You've completed 5 of 5 steps. 100% complete.               │
│ Last updated: Oct 14, 2025, 2:30 PM                         │
│                                                               │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ [★ Complete financial profile]  Share a few basics…  │   │
│ └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Summary Cards (4-column grid)
```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ COMPLETENESS │  STEADINESS  │  MOMENTUM    │  SAFETY NETS │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ Profile      │ Key factors  │ Your growth  │ Your cushion │
│ complete     │ influencing  │ trajectory   │ & protection │
│              │ your income  │ and career   │ mechanisms   │
│ ✓ 100%       │              │              │              │
│ ▓▓▓▓▓▓▓▓▓▓  │ ✓ Full-time  │ ↑ Strong 80% │ ✓ 6 months   │
│              │   employee   │   promotion  │   emergency  │
│ Last updated:│ ✓ 2y 4m      │ ✓ 75% skill  │ ✓ Disability │
│ Just now     │   tenure     │   progress   │   insurance  │
│              │ ✓ Healthy    │ • Balanced   │ • 15% savings│
│              │   industry   │   skills     │              │
│              │ • 3.4% unemp │ ✓ High 85%   │              │
│              │   SF         │   satisfaction│              │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### Detailed Sections (Expandable)

```
┌─────────────────────────────────────────────────────────────┐
│ 💼 Work Overview                                             │
├─────────────────────────────────────────────────────────────┤
│ EMPLOYMENT TYPE          ROLE                                │
│ Full-time employee       Senior Product Designer             │
│                                                               │
│ COMPANY                  TENURE                              │
│ Vibance Labs            2 years, 4 months                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🛡️ Stability Factors                                         │
├─────────────────────────────────────────────────────────────┤
│ INDUSTRY OUTLOOK         REGIONAL MARKET                     │
│ Healthy                  San Francisco, CA (3.4% unemp)     │
│                                                               │
│ LAYOFFS (5 YEARS)       CONTRACT RENEWAL                    │
│ None                     —                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 💰 Income Reliability                                        │
├─────────────────────────────────────────────────────────────┤
│ VARIABLE PAY RELIABILITY  SAVINGS RATE                       │
│ Predictable each cycle    15%                               │
│                                                               │
│ INCOME PROTECTION                                            │
│ Disability insurance, Short-term disability                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📈 Growth & Opportunity                                      │
├─────────────────────────────────────────────────────────────┤
│ PROMOTION LIKELIHOOD     UPSKILLING PROGRESS                 │
│ 80%                      75%                                 │
│                                                               │
│ SKILL MARKET DEMAND      ROLE SATISFACTION                   │
│ In demand                85%                                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🔒 Safety Net                                                │
├─────────────────────────────────────────────────────────────┤
│ EMERGENCY FUND           MAJOR EXPENSE                       │
│ 6 months                 —                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 📝 Additional Context                                        │
├─────────────────────────────────────────────────────────────┤
│ Currently exploring leadership opportunities and taking      │
│ additional courses in product management.                    │
└─────────────────────────────────────────────────────────────┘
```

## Empty State (When No Profile Exists)

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│                  Your overview will appear here               │
│                                                               │
│     Launch the financial profile wizard above to tell Vibance │
│     about your pay structure, growth momentum, and safety    │
│     nets. We'll transform those answers into a living        │
│     profile.                                                  │
│                                                               │
│              [ Open financial profile ]                      │
│                                                               │
│     Your responses stay private to your account and only     │
│     inform Vibance insights.                                 │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Background Colors
- Main background: `#000` (black)
- Card backgrounds: `#0a0a12` with opacity (neutral-950)
- Card borders: `#262626` (neutral-900)
- Gradient accents: Neon green + Purple

### Text Colors
- Primary headings: `#FFFFFF` (white)
- Body text: `#D4D4D8` (neutral-300)
- Secondary text: `#A1A1AA` (neutral-400)
- Muted text: `#71717A` (neutral-500)

### Accent Colors
- **High/Positive**: `#CCFF00` (neon green) - ✓ ↑
- **Moderate**: `#A1A1AA` (neutral-400) - •
- **Low/Warning**: `#FB923C` (orange-400) - ⚠

### Interactive Elements
- Launch button background: `linear-gradient(135deg, #CCFF00, #b8e600)`
- Launch button text: `#000` (black)
- Launch button shadow: `0 4px 16px rgba(204, 255, 0, 0.3)`
- Hover state: Elevated shadow + translateY(-2px)

## Responsive Breakpoints

### Desktop (> 1280px)
- 4-column summary grid
- Max-width: 1536px (6xl)
- Horizontal launch card layout

### Tablet (640px - 1280px)
- 2-column summary grid
- Max-width: 1280px (5xl)
- Horizontal launch card layout

### Mobile (< 640px)
- 1-column summary grid
- Stacked detailed sections
- Vertical launch card layout
- Reduced padding and font sizes

## Interactive Elements

### Launch Button States
1. **Default**: Gradient background with shadow
2. **Hover**: Elevated shadow, translateY(-2px)
3. **Active**: Return to baseline position
4. **Dismissed**: Hidden when profile is complete

### Progress Bar
- Background track: `#262626` (neutral-900)
- Filled portion: `#CCFF00` (neon green)
- Smooth transition animation (0.5s)
- Percentage text dynamically updates

### Real-Time Updates
- Listen for `financial-profile:updated` (and legacy `income-profile:updated`) event
- Smooth fade transition when data changes
- Toast notification on wizard completion
- Confetti animation on 100% completion

## Accessibility Features

### Semantic HTML
- Proper heading hierarchy (h1 → h2 → h3)
- ARIA labels for interactive elements
- Role attributes for dialog/modal
- Live regions for status updates

### Keyboard Navigation
- Tab order follows visual flow
- Focus visible states on all interactive elements
- Escape key closes modal
- Enter/Space activates buttons

### Screen Readers
- Descriptive alt text for icons
- Status announcements for save states
- Progress percentage announced
- Card labels properly associated

## Data Privacy

### What's Shown
- Employment type (general category)
- Role/company (user entered)
- Percentages and time periods
- Qualitative assessments

### What's NOT Shown
- Actual salary amounts
- Bank account details
- Transaction history
- Personal identification

### Security
- Firestore security rules enforce user-level isolation
- Authentication required to view
- No server-side rendering of sensitive data
- Client-side filtering of undefined fields

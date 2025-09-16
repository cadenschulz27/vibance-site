const {
  fallbackRewrite,
  scoreArticle,
  extractTickers,
  computeSentiment,
} = require('../getNews.js')._test;

describe('fallbackRewrite', () => {
  const sample = {
    title: 'Apple shares climb as iPhone demand surges',
    description: 'Apple (AAPL) rallies after reporting stronger-than-expected revenue.',
    content: 'Investors applauded the earnings update, pushing the stock higher on Monday.',
    sourceName: 'Bloomberg'
  };

  test('produces a structured briefing', () => {
    const result = fallbackRewrite(sample);
    expect(result.headline).toBeTruthy();
    expect(result.summary.length).toBeGreaterThan(10);
    expect(Array.isArray(result.keyTakeaways)).toBe(true);
    expect(result.method).toBe('heuristic');
    expect(result.complianceNote).toMatch(/Vibance/);
    expect(result.summary).not.toMatch(/\[\+\d+/);
  });

  test('handles missing description without crashing', () => {
    const result = fallbackRewrite({ title: 'Markets mixed', content: 'Traders digest data.', sourceName: 'Reuters' });
    expect(result.summary).toBeTruthy();
    expect(Array.isArray(result.keyTakeaways)).toBe(true);
    result.keyTakeaways.forEach((item) => expect(item).not.toMatch(/\[\+\d+/));
  });
});

describe('scoreArticle', () => {
  const base = {
    source: { name: 'Example' },
    description: 'Short blurb',
    content: 'Longer content body for scoring.',
  };

  test('scores newer articles higher than very old ones', () => {
    const recent = scoreArticle({ ...base, publishedAt: new Date().toISOString() });
    const old = scoreArticle({
      ...base,
      publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    });
    expect(recent).toBeGreaterThan(old);
  });
});

describe('extractTickers', () => {
  test('finds unique uppercase tokens', () => {
    const tickers = extractTickers('AAPL rallied while TSLA and AAPL saw heavy volume.');
    expect(tickers).toEqual(['AAPL', 'TSLA']);
  });

  test('filters common stopwords', () => {
    const tickers = extractTickers('The ETF and WITH bond');
    expect(tickers).toEqual([]);
  });
});

describe('computeSentiment', () => {
  test('detects positive context', () => {
    expect(computeSentiment('Growth and strong performance with gains')).toBe('positive');
  });

  test('detects negative context', () => {
    expect(computeSentiment('Weak outlook with loss and decline')).toBe('negative');
  });

  test('falls back to neutral', () => {
    expect(computeSentiment('Mixed signals today.')).toBe('neutral');
  });
});

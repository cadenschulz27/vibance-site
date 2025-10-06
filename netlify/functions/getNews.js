// netlify/functions/getNews.js
// Curates financial articles into original Vibance briefings.
const crypto = require('crypto');
const fetch = require('node-fetch');

const NEWS_COUNTRY = process.env.NEWS_COUNTRY || 'us';
const NEWS_CATEGORY = process.env.NEWS_CATEGORY || 'business';
const MAX_CANDIDATES = Number(process.env.NEWS_CANDIDATE_LIMIT || 15);
const MAX_STORIES = Number(process.env.NEWS_STORY_LIMIT || 6);
const MIN_SENTENCE_LENGTH = 25;
const CACHE_TTL_MS = Number(process.env.NEWS_CACHE_TTL_MS || 15 * 60 * 1000);
const DEFAULT_DISCLAIMER = process.env.NEWS_GLOBAL_DISCLAIMER
  || 'Vibance Briefs summarize third-party reporting. Verify details with the original source before making financial decisions.';
const TARGET_BULLET_COUNT = Number(process.env.NEWS_TAKEAWAY_TARGET || 3);
const MIN_BULLET_WORDS = Number(process.env.NEWS_MIN_BULLET_WORDS || 12);
const FALLBACK_MIN_BULLET_WORDS = Math.max(6, MIN_BULLET_WORDS - 4);
const MAX_TICKERS = Number(process.env.NEWS_MAX_TICKERS || 6);

const DISALLOWED_SOURCES = new Set(
  (process.env.NEWS_BLOCKED_SOURCES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

let cachedPayload = null;
let cacheTimestamp = 0;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const POSITIVE_TERMS = ['gain', 'growth', 'up', 'surge', 'improve', 'strong', 'bull', 'record'];
const NEGATIVE_TERMS = ['loss', 'drop', 'down', 'decline', 'fall', 'weak', 'bear', 'slump'];
const STOP_TICKERS = new Set(['THE', 'AND', 'FROM', 'WILL', 'THIS', 'WITH', 'HAVE', 'ETF', 'NEWS']);

const WORD_SUBSTITUTIONS = new Map([
  ['surpasses', 'tops'],
  ['surpassed', 'topped'],
  ['climbs', 'advances'],
  ['climb', 'advance'],
  ['rises', 'strengthens'],
  ['rise', 'strengthen'],
  ['falls', 'slides'],
  ['fall', 'slide'],
  ['drops', 'eases'],
  ['drop', 'ease'],
  ['growth', 'expansion'],
  ['decline', 'retreat'],
  ['warns', 'signals'],
  ['warn', 'signal'],
  ['faces', 'confronts'],
]);

const INCOMPLETE_ENDINGS = new Set([
  'and', 'or', 'but', 'if', 'while', 'because', 'although', 'though', 'since', 'as',
  'to', 'at', 'from', 'of', 'for', 'with', 'into', 'onto', 'than', 'versus', 'vs',
  'via', 'toward', 'towards', 'per', 'amid', 'despite', 'before', 'after', 'during',
  'including', 'according', 'accordingto', 'where', 'when', 'who', 'which', 'that'
]);

function splitSentences(text = '') {
  const raw = (text || '')
    .replace(/\s+/g, ' ')
    .replace(/([a-z0-9])([.!?])(?=\s|$)/gi, '$1$2|')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  return raw.filter((s) => s.length >= MIN_SENTENCE_LENGTH);
}

function uniqueId(input) {
  return crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
}

function sanitizeFragment(text = '') {
  return (text || '')
    .replace(/\s*\[\+\d+\s*chars?\]/gi, '')
    .replace(/\s*\(\+\d+\s*chars?\)/gi, '')
    .replace(/[.…]+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueByLower(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const lower = (value || '').trim().toLowerCase();
    if (!lower || seen.has(lower)) continue;
    seen.add(lower);
    out.push(value.trim());
  }
  return out;
}

function toSentenceCase(str = '') {
  if (!str) return '';
  const trimmed = str.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function wordCount(text = '') {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

function substituteWords(line = '') {
  return line
    .split(' ')
    .map((word) => {
      const key = word.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (!key) return word;
      const replacement = WORD_SUBSTITUTIONS.get(key);
      if (!replacement) return word;
      const suffix = word.slice(key.length);
      return replacement + suffix;
    })
    .join(' ');
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with']);

function toHeadlineCase(text = '') {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  return words
    .map((word, idx) => {
      const stripped = word.replace(/[^A-Za-z0-9'-]/g, '');
      const lower = stripped.toLowerCase();
      if (idx !== 0 && SMALL_WORDS.has(lower)) return lower;
      if (!stripped) return word;
      const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
      return word.replace(stripped, capitalized);
    })
    .join(' ');
}

function deriveHeadline(summary = '', bullets = [], fallbackFocus = 'Market update') {
  const primarySource = Array.isArray(bullets) && bullets.length
    ? bullets[0]
    : summary;

  let candidate = sanitizeFragment(primarySource || '')
    || sanitizeFragment(summary || '')
    || fallbackFocus;

  candidate = candidate.replace(/[\s]+/g, ' ').trim();
  candidate = candidate.replace(/[.!?]+$/, '');

  if (candidate.length < 6) {
    candidate = fallbackFocus;
  }

  return toHeadlineCase(candidate);
}

function ensureTerminal(text = '') {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/[.!?]$/.test(trimmed)) return trimmed;
  return `${trimmed}.`;
}

function isIncompleteSentence(text = '') {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (!/[.!?]$/.test(trimmed)) return true;
  const body = trimmed.replace(/[.!?]$/, '');
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length < 7) return true;
  const lastWord = words[words.length - 1].toLowerCase();
  if (INCOMPLETE_ENDINGS.has(lastWord)) return true;
  return false;
}

function normalizeBullet(raw = '', minWords = MIN_BULLET_WORDS) {
  const sanitized = ensureTerminal(toSentenceCase(substituteWords(sanitizeFragment(String(raw)))));
  if (!sanitized) return '';
  if (isIncompleteSentence(sanitized)) return '';
  if (wordCount(sanitized) < minWords) return '';
  return sanitized;
}

function buildBulletPoints(primaryCandidates = [], summaryLowerSet = new Set(), limit = TARGET_BULLET_COUNT, ...fallbackCandidateLists) {
  const bullets = [];
  const seen = new Set();
  const queues = [];

  if (Array.isArray(primaryCandidates)) queues.push({ list: primaryCandidates, minWords: MIN_BULLET_WORDS });
  fallbackCandidateLists.forEach((list, idx) => {
    if (!Array.isArray(list)) return;
    const relaxation = Math.max(0, idx * 2);
    queues.push({ list, minWords: Math.max(5, FALLBACK_MIN_BULLET_WORDS - relaxation) });
  });

  const tryAdd = (raw, minWords) => {
    if (bullets.length >= limit) return;
    const candidate = normalizeBullet(raw, minWords);
    if (!candidate) return;
    const lower = candidate.toLowerCase();
    if (summaryLowerSet.has(lower)) return;
    if (seen.has(lower)) return;
    bullets.push(candidate);
    seen.add(lower);
  };

  for (const { list, minWords } of queues) {
    for (const raw of list) {
      tryAdd(raw, minWords);
      if (bullets.length >= limit) break;
    }
    if (bullets.length >= limit) break;
  }

  return bullets;
}

function buildPerspective(sentiment, summary = '', bullets = []) {
  const trimmed = sanitizeFragment(summary).replace(/\r?\n/g, ' ').trim();
  const focus = Array.isArray(bullets) && bullets.length ? sanitizeFragment(bullets[0]) : trimmed;
  const focusClause = focus
    ? `Coverage notes that ${focus.charAt(0).toLowerCase() + focus.slice(1).replace(/[.!?]+$/, '')}.`
    : 'Coverage notes that conditions remain fluid.';

  let outlookLine;
  switch (sentiment) {
    case 'positive':
      outlookLine = 'Treat the setup as constructive, but rely on upcoming catalysts to confirm that momentum deserves additional exposure.';
      break;
    case 'negative':
      outlookLine = 'Treat the setup as fragile, protect the downside, and track whether policy or demand responses begin to stabilize the pressure.';
      break;
    default:
      outlookLine = 'Treat the setup as mixed, stay flexible, and wait for clearer signals before leaning into a decisive stance.';
      break;
  }

  return `${focusClause} ${outlookLine}`.trim();
}

function inferRiskLevel(sentiment = 'neutral') {
  switch (sentiment) {
    case 'positive':
      return 'moderate opportunity';
    case 'negative':
      return 'elevated risk';
    default:
      return 'balanced';
  }
}

function dedupeArticles(articles = []) {
  const map = new Map();
  for (const article of articles) {
    if (!article?.url) continue;
    const url = article.url.toLowerCase().split('?')[0];
    if (map.has(url)) continue;
    map.set(url, article);
  }
  return Array.from(map.values());
}

function scoreArticle(article) {
  const publishedAt = new Date(article.publishedAt || article.published_at || Date.now());
  const ageHours = Math.max(1, (Date.now() - publishedAt.getTime()) / 36e5);
  const descriptionScore = (article.description || '').length / 40;
  const contentScore = (article.content || '').length / 60;
  const imageBonus = article.urlToImage ? 2 : 0;
  const sourceBonus = article.source?.name ? 1 : 0;
  return (descriptionScore + contentScore + imageBonus + sourceBonus) / ageHours;
}

function extractTickers(text = '') {
  const matches = text.match(/\b[A-Z]{2,5}\b/g) || [];
  const out = [];
  for (const raw of matches) {
    const token = raw.toUpperCase();
    if (STOP_TICKERS.has(token)) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out.slice(0, 6);
}

function mergeTickers(...lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const token = String(raw || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!token) continue;
      if (token.length > 6 || token.length < 1) continue;
      if (STOP_TICKERS.has(token)) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      merged.push(token);
      if (merged.length >= MAX_TICKERS) return merged;
    }
  }
  return merged;
}

function computeSentiment(text = '') {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of POSITIVE_TERMS) {
    if (lower.includes(term)) score += 1;
  }
  for (const term of NEGATIVE_TERMS) {
    if (lower.includes(term)) score -= 1;
  }
  if (score > 1) return 'positive';
  if (score < -1) return 'negative';
  return 'neutral';
}

function fallbackRewrite(article) {
  const sourceName = article.sourceName || 'the original report';
  const context = [article.title, article.description, article.content]
    .filter(Boolean)
    .join(' ');

  const sentences = splitSentences(context);
  const sanitizedTitle = sanitizeFragment(article.title || '').toLowerCase();
  const sanitizedSentences = uniqueByLower(
    sentences
      .map((s) => sanitizeFragment(s))
      .filter((s) => s && s.length >= 35)
      .filter((s) => {
        if (!sanitizedTitle) return true;
        return !s.toLowerCase().includes(sanitizedTitle);
      })
  )
    .map((s) => ensureTerminal(toSentenceCase(substituteWords(s))))
    .filter((s) => !isIncompleteSentence(s));

  let summarySentences = sanitizedSentences.slice(0, 2);
  if (summarySentences.length < 2) {
    summarySentences = sentences
      .map((s) => ensureTerminal(toSentenceCase(substituteWords(sanitizeFragment(s)))))
      .filter((s) => !isIncompleteSentence(s))
      .slice(0, 2);
  }
  if (!summarySentences.length && sanitizedSentences.length) {
    summarySentences = sanitizedSentences.slice(0, Math.min(2, sanitizedSentences.length));
  }
  let summary = summarySentences.join(' ');
  if (!summary) {
    const fallback = sanitizeFragment(context);
    summary = fallback ? toSentenceCase(substituteWords(fallback.slice(0, 240))) : 'Summary unavailable.';
  }

  const summaryLowerSet = new Set(summarySentences.map((s) => s.toLowerCase()));
  summaryLowerSet.add(summary.toLowerCase());
  const remainder = sanitizedSentences.slice(summarySentences.length);
  const summaryPieces = summary.split(/(?<=\.)\s+/).map((item) => ensureTerminal(item));
  let keyTakeaways = buildBulletPoints(remainder, summaryLowerSet, TARGET_BULLET_COUNT, sanitizedSentences, sentences, summaryPieces);
  if (!keyTakeaways.length) {
    keyTakeaways = buildBulletPoints(summaryPieces, new Set(), Math.min(TARGET_BULLET_COUNT, summaryPieces.length), summaryPieces);
  }
  if (!keyTakeaways.length && summarySentences.length) {
    keyTakeaways = summarySentences.slice(0, Math.min(TARGET_BULLET_COUNT, summarySentences.length));
  }

  const sentiment = computeSentiment(context);
  const headline = deriveHeadline(summary, keyTakeaways, `${sourceName} Update`);
  const riskLevel = inferRiskLevel(sentiment);
  const tickers = mergeTickers(extractTickers(context));

  return {
    headline,
    summary,
    keyTakeaways,
    tickers,
    sentiment,
    riskLevel,
    insight: buildPerspective(sentiment, summary, keyTakeaways),
    method: 'heuristic',
    complianceNote: `Summary compiled by Vibance using reporting from ${sourceName}. Review the original article for complete context before making decisions.`
  };
}

async function rewriteWithOpenAI(article) {
  if (!OPENAI_API_KEY) return null;

  const context = [article.title, article.description, article.content]
    .filter(Boolean)
    .join('\n\n');
  if (!context) return null;

  const prompt = `Rewrite the following financial news details into an original Vibance briefing. ` +
    `Respond ONLY with valid JSON using this schema: {"headline": string, "summary": string, "keyTakeaways": string[], "insight": string, "sentiment": "positive"|"neutral"|"negative", "riskLevel": string, "tickers": string[]}. ` +
    `Headlines must stay factual yet timely. ` +
    `Summary should be 2-3 sentences (65-95 words) that capture the central development, catalysts, and market context. ` +
    `Each key takeaway MUST be a single complete sentence between 12 and 28 words, ending with a period, and outline a distinct actionable insight. Avoid fragments or stacked clauses. Provide at most ${TARGET_BULLET_COUNT} items.` +
    `Risk level should be a short phrase (e.g. "elevated risk", "balanced opportunity") summarizing forward-looking posture. ` +
    `Ticker list should include unique equity tickers or be an empty array if none are mentioned. ` +
    `Ensure the insight paragraph has at least two sentences that contextualize next steps for Vibance clients. ` +
    `Article snippets:\n${context}`;

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You are a financial editor for Vibance. Produce compliant, fact-based internal copy without embellishment.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenAI request failed (${response.status}): ${errText}`);
  }

  const result = await response.json();
  const choice = result?.choices?.[0]?.message?.content;
  if (!choice) throw new Error('OpenAI response missing content');

  let parsed;
  try {
    parsed = JSON.parse(choice);
  } catch (err) {
    throw new Error('Failed to parse OpenAI JSON payload');
  }

  if (!parsed.headline || !parsed.summary) {
    throw new Error('OpenAI response incomplete');
  }

  const takeawaysRaw = Array.isArray(parsed.keyTakeaways) ? parsed.keyTakeaways : [];
  const rawSummary = sanitizeFragment(parsed.summary);
  const sanitizedSummary = toSentenceCase(substituteWords(rawSummary));
  const summarySentences = sanitizedSummary
    .split(/(?<=\.)\s+/)
    .map((item) => ensureTerminal(toSentenceCase(substituteWords(sanitizeFragment(item)))))
    .filter(Boolean);
  const summaryLowerSet = new Set(summarySentences.map((s) => s.toLowerCase()));
  const contextSentences = splitSentences(context);
  const sanitizedTakeaways = takeawaysRaw.map((item) => sanitizeFragment(String(item)));
  let keyTakeaways = buildBulletPoints(sanitizedTakeaways, summaryLowerSet, TARGET_BULLET_COUNT, takeawaysRaw, contextSentences, summarySentences);
  if (!keyTakeaways.length) {
    keyTakeaways = buildBulletPoints(contextSentences, summaryLowerSet, TARGET_BULLET_COUNT, summarySentences);
  }
  if (!keyTakeaways.length && summarySentences.length) {
    keyTakeaways = summarySentences.slice(0, Math.min(TARGET_BULLET_COUNT, summarySentences.length));
  }
  const safeHeadline = deriveHeadline(sanitizedSummary, keyTakeaways, `${article.sourceName || 'Market'} Update`);
  const sanitizedInsight = sanitizeFragment(parsed.insight || '');
  const insightSentences = sanitizedInsight.split(/[.!?]/).filter((s) => s.trim());
  const perspective = insightSentences.length >= 2
    ? insightSentences.map((line) => ensureTerminal(toSentenceCase(substituteWords(line)))).join(' ')
    : buildPerspective(parsed.sentiment, sanitizedSummary, keyTakeaways);

  const aiTickers = Array.isArray(parsed.tickers) ? parsed.tickers : [];
  const tickers = mergeTickers(aiTickers, extractTickers(context), extractTickers(sanitizedSummary));
  const sentimentNormalized = parsed.sentiment === 'positive' || parsed.sentiment === 'negative' ? parsed.sentiment : 'neutral';
  const riskRaw = sanitizeFragment(parsed.riskLevel || '') || inferRiskLevel(sentimentNormalized);
  const riskLevel = toSentenceCase(riskRaw);

  return {
    headline: safeHeadline,
    summary: sanitizedSummary,
    keyTakeaways,
    tickers,
    sentiment: sentimentNormalized,
    riskLevel,
    insight: perspective,
    method: 'llm'
  };
}

async function curateArticle(article) {
  const base = {
    title: article.title,
    description: article.description,
    content: article.content,
    sourceName: article.source?.name || 'the original report'
  };

  let curated;
  try {
    curated = await rewriteWithOpenAI(base);
  } catch (err) {
    console.warn('OpenAI rewrite failed, using fallback:', err.message);
  }

  if (!curated) {
    curated = fallbackRewrite(base);
  } else {
    curated.complianceNote = `Summary generated by Vibance using reporting from ${base.sourceName}. Review the original article for complete context before making decisions.`;
  }

  const combinedContext = [article.title, article.description, article.content]
    .filter(Boolean)
    .join(' ');
  const tickers = mergeTickers(Array.isArray(curated.tickers) ? curated.tickers : [], extractTickers(combinedContext));
  const riskLevel = curated.riskLevel || inferRiskLevel(curated.sentiment);

  return {
    id: uniqueId(article.url || article.title || String(Math.random())),
    headline: curated.headline,
    summary: curated.summary,
    keyTakeaways: curated.keyTakeaways,
    insight: curated.insight,
    sentiment: curated.sentiment,
    riskLevel,
    tickers,
    complianceNote: curated.complianceNote,
    attribution: {
      source: article.source?.name || 'Unknown publication',
      url: article.url
    },
    publishedAt: article.publishedAt || article.published_at || null,
    imageUrl: article.urlToImage || null,
    method: curated.method
  };
}

async function fetchNews() {
  const API_KEY = process.env.NEWS_API_KEY;
  if (!API_KEY) {
    throw new Error('News API key is not configured on the server.');
  }

  const url = `https://newsapi.org/v2/top-headlines?country=${NEWS_COUNTRY}&category=${NEWS_CATEGORY}&pageSize=${Math.max(MAX_CANDIDATES, MAX_STORIES)}&apiKey=${API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error('News API Error:', errorBody);
    throw new Error(`News API responded with status: ${response.status}`);
  }
  const data = await response.json();
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return {
    articles,
    totalResults: data?.totalResults || articles.length
  };
}

async function curateNewsFeed() {
  const { articles, totalResults } = await fetchNews();
  const deduped = dedupeArticles(articles)
    .map((article) => ({
      ...article,
      score: scoreArticle(article)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .filter((article) => {
      const sourceName = (article.source?.name || '').toLowerCase();
      return sourceName ? !DISALLOWED_SOURCES.has(sourceName) : true;
    });

  const selected = [];
  for (const article of deduped) {
    if (selected.length >= MAX_STORIES) break;
    try {
      const curated = await curateArticle(article);
      selected.push(curated);
    } catch (err) {
      console.error('Failed to curate article:', err.message);
    }
  }

  const payload = {
    stories: selected,
    meta: {
      totalResults,
      considered: deduped.length,
      curated: selected.length,
      usedLLM: Boolean(OPENAI_API_KEY),
      disclaimer: DEFAULT_DISCLAIMER,
      blockedSources: Array.from(DISALLOWED_SOURCES)
    }
  };

  console.info('Vibance Brief curated sources:', selected.map((story) => story.attribution.source).join(', '));

  cachedPayload = payload;
  cacheTimestamp = Date.now();

  return payload;
}

exports._test = {
  fallbackRewrite,
  scoreArticle,
  extractTickers,
  computeSentiment,
};

exports.handler = async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const payload = await curateNewsFeed();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    };
  } catch (error) {
    console.error('Curated news function error:', error);
    const age = Date.now() - cacheTimestamp;
    if (cachedPayload && age < CACHE_TTL_MS) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...cachedPayload,
          meta: {
            ...cachedPayload.meta,
            cacheFallback: true,
            cacheAgeMs: age
          }
        })
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

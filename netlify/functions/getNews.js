// netlify/functions/getNews.js
// Curates financial articles into original Vibance briefings.
const crypto = require('crypto');
const fetch = require('node-fetch');

const NEWS_COUNTRY = process.env.NEWS_COUNTRY || 'us';
const NEWS_CATEGORY = process.env.NEWS_CATEGORY || 'business';
const MAX_CANDIDATES = Number(process.env.NEWS_CANDIDATE_LIMIT || 15);
const MAX_STORIES = Number(process.env.NEWS_STORY_LIMIT || 6);
const MIN_SENTENCE_LENGTH = 35;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const POSITIVE_TERMS = ['gain', 'growth', 'up', 'surge', 'improve', 'strong', 'bull'];
const NEGATIVE_TERMS = ['loss', 'drop', 'down', 'decline', 'fall', 'weak', 'bear'];
const STOP_TICKERS = new Set(['THE', 'AND', 'FROM', 'WILL', 'THIS', 'WITH', 'HAVE']);

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
  const context = [article.title, article.description, article.content]
    .filter(Boolean)
    .join(' ');
  const sentences = splitSentences(context);
  const summary = sentences.slice(0, 2).join(' ') || context.slice(0, 280);
  const keyTakeaways = sentences.slice(0, 3).map((s) => s.replace(/\s+/g, ' '));

  const rawTitle = article.title || 'Market update';
  const parts = rawTitle.split(/[-–—:]/);
  const focus = parts[0]?.trim() || 'Markets';
  const angle = parts.slice(1).join(' ').trim();
  let headline;
  if (angle) {
    headline = `How ${focus} is influencing ${angle}`;
  } else {
    headline = `Inside ${focus}: What Vibance clients should watch`;
  }

  const sentiment = computeSentiment(context);
  const riskLevel = sentiment === 'positive'
    ? 'moderate opportunity'
    : sentiment === 'negative'
      ? 'elevated risk'
      : 'balanced';

  const analysisNote = sentiment === 'positive'
    ? 'Momentum appears constructive, but monitor follow-through before acting.'
    : sentiment === 'negative'
      ? 'Keep a defensive stance until catalysts confirm a reversal.'
      : 'Mixed signals suggest waiting for a clearer catalyst.';

  return {
    headline,
    summary: summary.trim(),
    keyTakeaways,
    tickers: extractTickers(context),
    sentiment,
    riskLevel,
    insight: analysisNote,
    method: 'heuristic'
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
    `Headlines should feel fresh while staying factual. Cite the same facts, avoid speculation, limit summary to 90 words. ` +
    `Key takeaways should be concise bullets (max 3) describing what clients should know. ` +
    `Risk level should be a short phrase (e.g. "elevated risk", "balanced"). ` +
    `Ticker list should include any mentioned equities; return an empty array if none. ` +
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

  parsed.tickers = Array.isArray(parsed.tickers) ? parsed.tickers.slice(0, 6) : [];
  parsed.keyTakeaways = Array.isArray(parsed.keyTakeaways)
    ? parsed.keyTakeaways.slice(0, 3)
    : [];

  return {
    headline: parsed.headline.trim(),
    summary: parsed.summary.trim(),
    keyTakeaways: parsed.keyTakeaways.map((item) => String(item).trim()).filter(Boolean),
    tickers: parsed.tickers.map((item) => String(item).trim()).filter(Boolean),
    sentiment: parsed.sentiment === 'positive' || parsed.sentiment === 'negative' ? parsed.sentiment : 'neutral',
    riskLevel: parsed.riskLevel ? String(parsed.riskLevel).trim() : 'balanced',
    insight: parsed.insight ? String(parsed.insight).trim() : '',
    method: 'llm'
  };
}

async function curateArticle(article) {
  const base = {
    title: article.title,
    description: article.description,
    content: article.content
  };

  let curated;
  try {
    curated = await rewriteWithOpenAI(base);
  } catch (err) {
    console.warn('OpenAI rewrite failed, using fallback:', err.message);
  }

  if (!curated) {
    curated = fallbackRewrite(base);
  }

  return {
    id: uniqueId(article.url || article.title || String(Math.random())),
    headline: curated.headline,
    summary: curated.summary,
    keyTakeaways: curated.keyTakeaways,
    insight: curated.insight,
    sentiment: curated.sentiment,
    riskLevel: curated.riskLevel,
    tickers: curated.tickers,
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
    .slice(0, MAX_CANDIDATES);

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

  return {
    stories: selected,
    meta: {
      totalResults,
      considered: deduped.length,
      curated: selected.length,
      usedLLM: Boolean(OPENAI_API_KEY)
    }
  };
}

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
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

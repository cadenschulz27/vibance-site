const fetch = require('node-fetch');

const API_URL = 'https://api.cohere.com/v1/chat';
const DEFAULT_MODEL = process.env.COHERE_MODEL || 'command-r-plus';
const API_KEY = process.env.COHERE_API_KEY;

function jsonResponse(status, payload = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(payload),
  };
}

function buildUserPrompt(payload) {
  const {
    headline,
    summary,
    takeaways = [],
    insight,
    sentiment,
    riskLevel,
    attribution,
    publishedAt,
  } = payload || {};

  const parts = [];
  if (headline) parts.push(`Headline: ${headline}`);
  if (publishedAt) parts.push(`Published: ${publishedAt}`);
  if (attribution) parts.push(`Source: ${attribution}`);
  if (sentiment) parts.push(`Sentiment: ${sentiment}`);
  if (riskLevel) parts.push(`Risk level: ${riskLevel}`);

  parts.push(`Summary: ${summary}`);

  if (Array.isArray(takeaways) && takeaways.length) {
    parts.push('Key developments:\n- ' + takeaways.slice(0, 4).join('\n- '));
  }

  if (insight) parts.push(`Perspective: ${insight}`);

  parts.push(
    'Task: Provide one short advisory note (2-3 sentences, max 70 words) focused on what a vibey wealth coach would tell a client next. Offer a specific next step or question. Avoid repeating the summary verbatim.'
  );

  return parts.join('\n\n');
}

module.exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { Allow: 'POST' },
      body: 'Method Not Allowed',
    };
  }

  if (!API_KEY) {
    return jsonResponse(500, { error: 'Missing Cohere API key. Set COHERE_API_KEY.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return jsonResponse(400, { error: 'Invalid JSON payload.' });
  }

  if (!payload?.summary) {
    return jsonResponse(400, { error: 'Field "summary" is required.' });
  }

  const body = {
    model: DEFAULT_MODEL,
    temperature: Number.isFinite(Number(process.env.COHERE_TEMPERATURE))
      ? Number(process.env.COHERE_TEMPERATURE)
      : 0.6,
    max_tokens: Math.min(Number(process.env.COHERE_MAX_TOKENS) || 220, 400),
    message: buildUserPrompt(payload),
    stream: false,
    preamble: 'You are the Vibance concierge AI. You speak with warmth, clarity, and a bias toward actionable guidance. Keep responses compact (2-3 sentences, under 70 words), avoid emojis, and never fabricate numbers. When you outline an action, include the rationale in plain language.',
  };

  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'Cohere-Version': '2024-08-06',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('Cohere request failed', err);
    return jsonResponse(502, { error: 'Failed to reach Cohere API.' });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Cohere error', response.status, errorText);
    return jsonResponse(response.status, { error: 'Cohere API error', details: errorText });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    console.error('Failed to parse Cohere response', err);
    return jsonResponse(502, { error: 'Invalid response from Cohere.' });
  }

  const tip = (data?.text || data?.response || '').toString().trim();
  if (!tip) {
    return jsonResponse(502, { error: 'No content returned from Cohere.' });
  }

  return jsonResponse(200, {
    tip,
    model: data?.model || DEFAULT_MODEL,
    usage: data?.meta || null,
  });
};

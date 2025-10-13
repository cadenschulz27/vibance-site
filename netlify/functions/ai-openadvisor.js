const fetch = require('node-fetch');

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';
const API_KEY = process.env.OPENROUTER_API_KEY;

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
    return jsonResponse(500, { error: 'Missing OpenRouter API key. Set OPENROUTER_API_KEY.' });
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
    messages: [
      {
        role: 'system',
        content: 'You are the Vibance concierge AI. You speak with warmth, clarity, and a bias toward actionable guidance. Keep responses compact, avoid emojis, and do not fabricate numbers. When you reference an action, include the rationale in plain language.',
      },
      {
        role: 'user',
        content: buildUserPrompt(payload),
      },
    ],
    max_tokens: 220,
    temperature: Number.isFinite(Number(process.env.OPENROUTER_TEMPERATURE))
      ? Number(process.env.OPENROUTER_TEMPERATURE)
      : 0.6,
    top_p: 0.9,
  };

  let response;

  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
        'HTTP-Referer': process.env.URL || 'https://vibance.com',
        'X-Title': 'Vibance Concierge',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error('OpenRouter request failed', err);
    return jsonResponse(502, { error: 'Failed to reach OpenRouter API.' });
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('OpenRouter error', response.status, errorText);
    return jsonResponse(response.status, { error: 'OpenRouter API error', details: errorText });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    console.error('Failed to parse OpenRouter response', err);
    return jsonResponse(502, { error: 'Invalid response from OpenRouter.' });
  }

  const tip = data?.choices?.[0]?.message?.content?.trim();
  if (!tip) {
    return jsonResponse(502, { error: 'No content returned from OpenRouter.' });
  }

  return jsonResponse(200, {
    tip,
    model: data?.model || DEFAULT_MODEL,
    usage: data?.usage || null,
  });
};

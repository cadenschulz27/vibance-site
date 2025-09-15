// netlify/functions/getNews.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  // IMPORTANT: Your API Key must be stored in Netlify's environment variables
  const API_KEY = process.env.NEWS_API_KEY;
  const NEWS_URL = `https://newsapi.org/v2/top-headlines?country=us&category=business&apiKey=${API_KEY}`;

  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "News API key is not configured on the server." }),
    };
  }

  try {
    const response = await fetch(NEWS_URL);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('News API Error:', errorBody);
      throw new Error(`News API responded with status: ${response.status}`);
    }
    const data = await response.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Function Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
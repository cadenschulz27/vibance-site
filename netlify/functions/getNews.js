// FILE: netlify/functions/getNews.js

const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  const apiKey = process.env.NEWS_API_KEY;
<<<<<<< HEAD
  const apiUrl = `https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=40&apiKey=${apiKey}`;
=======
  const apiUrl = `https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=10&apiKey=${apiKey}`;
>>>>>>> 69977ec64fc7f682522edefcbdc47bb41afcced8

  // *** NEW: A list of sources to exclude ***
  const paywalledSources = [
    'The Wall Street Journal',
    'Bloomberg',
    'Reuters',
    'Financial Times',
    'The New York Times',
    'The Economist'
  ];

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    // *** NEW: Filter the articles to exclude paywalled sources ***
    if (data.articles) {
      const freeArticles = data.articles.filter(article => !paywalledSources.includes(article.source.name));
      data.articles = freeArticles;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data), // Send the filtered data back to the browser
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch news' }),
    };
  }
};
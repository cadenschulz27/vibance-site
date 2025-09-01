// FILE: netlify/functions/getNews.js

// Using node-fetch to make the API request on the server
const fetch = require('node-fetch');

exports.handler = async function (event, context) {
  // Get the secret API key from the environment variables
  const apiKey = process.env.NEWS_API_KEY;
  const apiUrl = `https://newsapi.org/v2/top-headlines?country=us&category=business&pageSize=3&apiKey=${apiKey}`;

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    return {
      statusCode: 200,
      body: JSON.stringify(data), // Send the data back to the browser
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch news' }),
    };
  }
};
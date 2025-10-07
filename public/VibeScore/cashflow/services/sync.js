// services/sync.js
// Coordinates background refreshes via Netlify functions / Plaid sync.

const NETLIFY_ENDPOINT = '/.netlify/functions/daily-cashflow';

/**
 * Triggers the Netlify function to refresh Plaid transactions and rollups.
 * @param {{ token: string }} options
 */
export async function triggerCashflowSync({ token }) {
  try {
    const response = await fetch(NETLIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : undefined,
      },
      body: JSON.stringify({ action: 'refresh_cashflow' }),
    });

    if (!response.ok) {
      const error = await safeJson(response);
      throw new Error(error?.message || `Cashflow sync failed with status ${response.status}`);
    }

    return safeJson(response);
  } catch (error) {
    console.warn('[cashflow] triggerCashflowSync failed', error);
    throw error;
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

// netlify/functions/get-account-balances.cjs
// Fetches current account balances from Plaid for the authenticated user
// Auth: Firebase ID token (Bearer)
// Response: { netWorth: number, accounts: [...], totalAssets: number, totalLiabilities: number }

const { auth, db } = require('../lib/firebase-admin.js');

let plaidClient;
try {
  const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

  const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
        'Plaid-Version': '2020-09-14',
      },
    },
  });

  plaidClient = new PlaidApi(plaidConfig);
} catch (initError) {
  console.error('[get-account-balances] Failed to initialize Plaid:', initError.message);
}

function json(status, data) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'OPTIONS, POST'
    },
    body: JSON.stringify(data)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST' });

  try {
    if (!plaidClient) {
      return json(500, { error: 'Plaid client not initialized' });
    }

    const authz = event.headers.authorization || event.headers.Authorization || '';
    const m = authz.match(/^Bearer\s+(.+)$/i);
    if (!m) return json(401, { error: 'Missing Authorization Bearer token' });

    const idToken = m[1];
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken, true);
    } catch (authError) {
      console.error('[get-account-balances] Auth error:', authError.message);
      return json(401, { error: 'Invalid token: ' + authError.message });
    }
    
    const uid = decoded.uid;

    // Get all Plaid items for this user
    let itemsSnap;
    try {
      itemsSnap = await db.collection('users').doc(uid).collection('plaid_items').get();
    } catch (dbError) {
      console.error('[get-account-balances] DB error fetching items:', dbError.message);
      return json(500, { error: 'Failed to fetch items: ' + dbError.message });
    }
    
    let totalAssets = 0;
    let totalLiabilities = 0;
    const allAccounts = [];

    // Fetch balances for each item
    for (const itemDoc of itemsSnap.docs) {
      const item = itemDoc.data();
      if (!item.access_token) {
        console.warn(`[get-account-balances] Item ${itemDoc.id} has no access_token`);
        continue;
      }

      try {
        // Fetch account balances from Plaid
        const response = await plaidClient.accountsGet({
          access_token: item.access_token,
        });

        const accounts = response.data.accounts || [];

        accounts.forEach((account) => {
          const balance = account.balances?.current || 0;
          const subtype = String(account.subtype || '').toLowerCase();

          const accountInfo = {
            account_id: account.account_id,
            name: account.name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype,
            balance: balance,
            institution_name: item.institution_name,
          };

          // Classify as asset or liability
          const isLiability = ['credit', 'credit card', 'loan', 'mortgage'].some(t => subtype.includes(t));

          if (isLiability) {
            totalLiabilities += Math.abs(balance);
            accountInfo.classification = 'liability';
          } else {
            if (balance > 0) {
              totalAssets += balance;
            } else if (balance < 0) {
              totalLiabilities += Math.abs(balance);
            }
            accountInfo.classification = 'asset';
          }

          allAccounts.push(accountInfo);
        });
      } catch (error) {
        console.error(`[get-account-balances] Failed to fetch balances for item ${itemDoc.id}:`, error.message || error);
        // Continue with other items
      }
    }

    const netWorth = totalAssets - totalLiabilities;

    return json(200, {
      ok: true,
      netWorth,
      totalAssets,
      totalLiabilities,
      accounts: allAccounts,
      accountCount: allAccounts.length,
    });
  } catch (error) {
    console.error('[get-account-balances] Top-level error:', error.message || error);
    return json(500, {
      ok: false,
      error: error.message || 'Failed to fetch account balances',
    });
  }
};

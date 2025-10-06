/**
 * @file /netlify/functions/plaid.js
 * @description Securely communicates with the Plaid API.
 */

// FIX: Import the 'Configuration' object for proper initialization.
const { Configuration, PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { auth, db } = require('../lib/firebase-admin');

// --- Plaid Client Initialization ---
// This uses the modern, correct configuration pattern for the Plaid SDK.
const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
        headers: {
            'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
            'PLAID-SECRET': process.env.PLAID_SECRET,
            'Plaid-Version': '2020-09-14', // Recommended by Plaid documentation
        },
    },
});

const plaidClient = new PlaidApi(plaidConfig);


function json(status, bodyObj) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(bodyObj)
  };
}

function maskSecret(str) {
  if (!str) return str;
  return str.slice(0,4) + '***' + str.slice(-4);
}

function checkRequiredEnv() {
  const missing = [];
  ['PLAID_CLIENT_ID','PLAID_SECRET','PLAID_ENV'].forEach(k => { if (!process.env[k]) missing.push(k); });
  return missing;
}

// --- Main Serverless Function Handler ---
exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // Securely verify the user's identity.
  const { authorization } = event.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return json(401, { error: 'Unauthorized: Missing token' });
  }
  const idToken = authorization.split('Bearer ')[1];
  
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (error) {
    return json(401, { error: 'Unauthorized: Invalid token' });
  }
  const userId = decodedToken.uid;
  const { action, public_token, metadata, item_id } = JSON.parse(event.body);
  const userRef = db.collection('users').doc(userId);

  // --- Action Router ---
  switch (action) {
    case 'create_link_token': {
      const missing = checkRequiredEnv();
      if (missing.length) {
        return json(500, { error: 'Plaid environment variables missing', missing });
      }
      try {
        const response = await plaidClient.linkTokenCreate({
          user: { client_user_id: userId },
          client_name: 'Vibance',
          products: [Products.Transactions],
            // NOTE: If you later add liabilities/investments etc. adjust here.
          country_codes: [CountryCode.Us],
          language: 'en',
        });
        return json(200, { ok: true, ...response.data });
      } catch (error) {
        const plaidErr = error?.response?.data || {};
        console.error('Plaid link_token error:', plaidErr || error.message);
        return json(500, {
          error: 'Failed to create Plaid link token.',
          plaid: {
            error_type: plaidErr.error_type,
            error_code: plaidErr.error_code,
            error_message: plaidErr.error_message,
            display_message: plaidErr.display_message,
            request_id: plaidErr.request_id,
            status: error?.response?.status
          },
          env: {
            plaid_env: process.env.PLAID_ENV,
            client_id_present: !!process.env.PLAID_CLIENT_ID,
            secret_present: !!process.env.PLAID_SECRET ? maskSecret(process.env.PLAID_SECRET) : null
          }
        });
      }
    }

    case 'exchange_public_token':
      try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token });
        const { access_token, item_id } = response.data;
        const itemRef = userRef.collection('plaid_items').doc(item_id);

        const accounts = Array.isArray(metadata?.accounts)
          ? metadata.accounts.map((account) => ({
              account_id: account.id || account.account_id || null,
              name: account.name || null,
              official_name: account.official_name || null,
              mask: account.mask || null,
              type: account.type || null,
              subtype: account.subtype || null,
              verification_status: account.verification_status || null,
            }))
          : [];

        await itemRef.set({
            access_token,
            item_id,
            institution_name: metadata?.institution?.name || 'Unknown',
            institution_id: metadata?.institution?.institution_id || null,
            linked_at: new Date(),
            last_synced: null,
            transactions_cursor: null,
            accounts,
            link_session_id: metadata?.link_session_id || null,
            updated_at: new Date(),
        }, { merge: true });
        return json(200, { message: 'Token exchange successful' });
      } catch (error) {
        console.error('Plaid exchange_token error:', error.response?.data || error.message);
        return json(500, { error: 'Failed to exchange public token.' });
      }

    case 'unlink_item':
      try {
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        const doc = await itemRef.get();
        if (!doc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
        await plaidClient.itemRemove({ access_token: doc.data().access_token });
        await itemRef.delete();
        return json(200, { message: 'Item unlinked' });
      } catch (error) {
        console.error('Plaid unlink_item error:', error.response?.data || error.message);
        return json(500, { error: 'Failed to unlink item.' });
      }

    case 'sync_transactions':
       try {
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };

        const { access_token } = itemDoc.data();
        let cursor = itemDoc.data().transactions_cursor || null;
        let added = [], modified = [], removed = [], hasMore = true;

        while (hasMore) {
            const response = await plaidClient.transactionsSync({ access_token, cursor });
            const data = response.data;
            added = added.concat(data.added);
            modified = modified.concat(data.modified);
            removed = removed.concat(data.removed.map(txn => txn.transaction_id));
            hasMore = data.has_more;
            cursor = data.next_cursor;
        }

        const batch = db.batch();
        const transactionsRef = itemRef.collection('transactions');
        added.forEach(txn => batch.set(transactionsRef.doc(txn.transaction_id), txn));
        modified.forEach(txn => batch.set(transactionsRef.doc(txn.transaction_id), txn, { merge: true }));
        removed.forEach(txnId => batch.delete(transactionsRef.doc(txnId)));
        await batch.commit();

        await itemRef.update({ transactions_cursor: cursor, last_synced: new Date() });
  return json(200, { message: 'Sync complete', added: added.length, modified: modified.length, removed: removed.length });
       } catch (error) {
        console.error('Plaid sync_transactions error:', error.response?.data || error.message);
  return json(500, { error: 'Failed to sync transactions.' });
       }
      
    default:
      return json(400, { error: 'Bad Request: Invalid action' });
  }
};


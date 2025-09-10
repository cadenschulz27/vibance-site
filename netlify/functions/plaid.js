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


// --- Main Serverless Function Handler ---
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Securely verify the user's identity.
  const { authorization } = event.headers;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Missing token' }) };
  }
  const idToken = authorization.split('Bearer ')[1];
  
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(idToken);
  } catch (error) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token' }) };
  }
  const userId = decodedToken.uid;
  const { action, public_token, metadata, item_id } = JSON.parse(event.body);
  const userRef = db.collection('users').doc(userId);

  // --- Action Router ---
  switch (action) {
    case 'create_link_token':
      try {
        const response = await plaidClient.linkTokenCreate({
          user: { client_user_id: userId },
          client_name: 'Vibance',
          products: [Products.Transactions],
          country_codes: [CountryCode.Us],
          language: 'en',
        });
        return { statusCode: 200, body: JSON.stringify(response.data) };
      } catch (error) {
        console.error('Plaid link_token error:', error.response?.data || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create Plaid link token.' }) };
      }

    case 'exchange_public_token':
      try {
        const response = await plaidClient.itemPublicTokenExchange({ public_token });
        const { access_token, item_id } = response.data;
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        await itemRef.set({
            access_token, item_id,
            institution_name: metadata.institution.name,
            linked_at: new Date(),
            last_synced: null,
            transactions_cursor: null,
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Token exchange successful' }) };
      } catch (error) {
        console.error('Plaid exchange_token error:', error.response?.data || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to exchange public token.' }) };
      }

    case 'unlink_item':
      try {
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        const doc = await itemRef.get();
        if (!doc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
        await plaidClient.itemRemove({ access_token: doc.data().access_token });
        await itemRef.delete();
        return { statusCode: 200, body: JSON.stringify({ message: 'Item unlinked' }) };
      } catch (error) {
        console.error('Plaid unlink_item error:', error.response?.data || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to unlink item.' }) };
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
        return { statusCode: 200, body: JSON.stringify({ message: 'Sync complete', added: added.length, modified: modified.length, removed: removed.length }) };
       } catch (error) {
        console.error('Plaid sync_transactions error:', error.response?.data || error.message);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to sync transactions.' }) };
       }
      
    default:
      return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Invalid action' }) };
  }
};


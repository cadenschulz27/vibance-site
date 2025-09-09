/**
 * @file /netlify/functions/plaid.js
 * @description Securely communicates with the Plaid API.
 */

const { PlaidApi, PlaidEnvironments, Products, CountryCode } = require('plaid');
const { auth, db } = require('../lib/firebase-admin');

const plaidClient = new PlaidApi({
  clientID: process.env.PLAID_CLIENT_ID,
  secret: process.env.PLAID_SECRET,
  environment: PlaidEnvironments.sandbox,
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

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

  if (action === 'create_link_token') {
    try {
      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: 'Vibance',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us],
        language: 'en',
      });
      return { statusCode: 200, body: JSON.stringify({ link_token: response.data.link_token }) };
    } catch (error) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create Plaid link token.' }) };
    }
  }

  if (action === 'exchange_public_token') {
    if (!public_token) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing public_token' }) };
    }
    try {
        const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
        const { access_token, item_id } = exchangeResponse.data;

        const itemRef = userRef.collection('plaid_items').doc(item_id);
        await itemRef.set({
            access_token,
            item_id,
            institution_name: metadata.institution.name,
            linked_at: new Date(),
            last_synced: null,
            transactions_cursor: null,
        });
        return { statusCode: 200, body: JSON.stringify({ message: 'Token exchange successful' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to exchange public token.' }) };
    }
  }
  
  if (action === 'unlink_item') {
    if (!item_id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing item_id' }) };
    }
    try {
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        const doc = await itemRef.get();
        if (!doc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };
        
        const { access_token } = doc.data();
        await plaidClient.itemRemove({ access_token });
        await itemRef.delete();
        
        return { statusCode: 200, body: JSON.stringify({ message: 'Item unlinked successfully' }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to unlink item.' }) };
    }
  }

  // FIX: New action to fetch and store transactions.
  if (action === 'sync_transactions') {
    if (!item_id) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing item_id' }) };
    }
    try {
        const itemRef = userRef.collection('plaid_items').doc(item_id);
        const itemDoc = await itemRef.get();
        if (!itemDoc.exists) return { statusCode: 404, body: JSON.stringify({ error: 'Item not found' }) };

        const { access_token } = itemDoc.data();
        let cursor = itemDoc.data().transactions_cursor || null;

        let added = [];
        let modified = [];
        let removed = [];
        let hasMore = true;

        // Iterate through each page of new transaction data
        while (hasMore) {
            const request = { access_token, cursor };
            const response = await plaidClient.transactionsSync(request);
            const data = response.data;

            added = added.concat(data.added);
            modified = modified.concat(data.modified);
            removed = removed.concat(data.removed.map(txn => txn.transaction_id));
            hasMore = data.has_more;
            cursor = data.next_cursor;
        }

        // Use a batched write to Firestore for efficiency
        const batch = db.batch();
        const transactionsRef = itemRef.collection('transactions');

        added.forEach(txn => batch.set(transactionsRef.doc(txn.transaction_id), txn));
        modified.forEach(txn => batch.set(transactionsRef.doc(txn.transaction_id), txn, { merge: true }));
        removed.forEach(txnId => batch.delete(transactionsRef.doc(txnId)));

        await batch.commit();

        // Update the item with the new cursor and sync time
        await itemRef.update({ transactions_cursor: cursor, last_synced: new Date() });

        return { statusCode: 200, body: JSON.stringify({ message: 'Sync complete', added: added.length, modified: modified.length, removed: removed.length }) };

    } catch (error) {
        console.error('Plaid transaction sync error:', error.response?.data || error);
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to sync transactions.' }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Invalid action' }) };
};


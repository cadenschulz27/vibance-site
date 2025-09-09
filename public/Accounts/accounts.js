/**
 * @file /Accounts/accounts.js
 * @description Main controller for the "Manage Accounts" page.
 */

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

function initAccountsPage() {
    const linkAccountBtn = document.getElementById('link-account-btn');
    const accountsListContainer = document.getElementById('linked-accounts-list');
    let plaidLinkHandler;

    function loadPlaidScript() {
        return new Promise((resolve, reject) => {
            if (document.getElementById('plaid-link-script')) return resolve();
            const script = document.createElement('script');
            script.id = 'plaid-link-script';
            script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
            script.onload = () => resolve();
            script.onerror = () => reject('Could not load Plaid script.');
            document.head.appendChild(script);
        });
    }

    async function fetchAndDisplayAccounts() {
        const user = auth.currentUser;
        if (!user) return;
        accountsListContainer.innerHTML = `<p class="loading-text">Loading...</p>`;
        try {
            const itemsCollectionRef = collection(db, 'users', user.uid, 'plaid_items');
            const querySnapshot = await getDocs(itemsCollectionRef);
            if (querySnapshot.empty) {
                accountsListContainer.innerHTML = `<p class="loading-text">You haven't linked any accounts yet.</p>`;
                return;
            }
            accountsListContainer.innerHTML = '';
            querySnapshot.forEach(doc => {
                const item = doc.data();
                const card = document.createElement('div');
                card.className = 'account-card';
                const lastSynced = item.last_synced ? `Last synced: ${new Date(item.last_synced.seconds * 1000).toLocaleString()}` : 'Not synced yet';
                card.innerHTML = `
                    <div class="account-info">
                        <img src="https://placehold.co/40x40/FFFFFF/000000?text=${item.institution_name.charAt(0)}" alt="${item.institution_name} logo" class="bank-logo">
                        <div>
                            <div class="account-name">${item.institution_name}</div>
                            <div class="account-mask">${lastSynced}</div>
                        </div>
                    </div>
                    <div class="account-actions">
                         <button class="btn-secondary sync-btn" data-item-id="${doc.id}">Sync Transactions</button>
                         <button class="btn-danger" data-item-id="${doc.id}">Unlink</button>
                    </div>
                `;
                accountsListContainer.appendChild(card);
            });
        } catch (error) {
            accountsListContainer.innerHTML = `<p class="loading-text text-red-500">Could not load accounts.</p>`;
        }
    }

    async function initializePlaid() {
        // FIX: Provide better user feedback during initialization and on error.
        linkAccountBtn.disabled = true;
        linkAccountBtn.textContent = 'Initializing...';
        try {
            await loadPlaidScript();
            const user = auth.currentUser;
            if (!user) throw new Error("User not authenticated.");
            const idToken = await user.getIdToken();

            const response = await fetch('/.netlify/functions/plaid', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_link_token' }),
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Failed to get link token from server.');
            const { link_token } = await response.json();

            plaidLinkHandler = Plaid.create({
                token: link_token,
                onSuccess: async (public_token, metadata) => {
                    try {
                        const user = auth.currentUser;
                        const idToken = await user.getIdToken();
                        await fetch('/.netlify/functions/plaid', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'exchange_public_token', public_token, metadata }),
                        });
                        fetchAndDisplayAccounts();
                    } catch (error) {
                        alert(`Could not save your account: ${error.message}`);
                    }
                },
            });
            // FIX: Re-enable the button once Plaid is ready.
            linkAccountBtn.disabled = false;
            linkAccountBtn.textContent = 'Link New Account';
        } catch (error) {
            console.error("Error initializing Plaid:", error);
            // FIX: Show a clear error message to the user.
            linkAccountBtn.textContent = 'Setup Error - Retry';
            linkAccountBtn.disabled = false;
            const errorElement = document.createElement('p');
            errorElement.className = 'text-red-500 text-center mt-4';
            errorElement.textContent = `Could not initialize bank linking: ${error.message}. Please ensure the backend is configured correctly.`;
            accountsListContainer.appendChild(errorElement);
        }
    }
    
    async function handleSync(itemId) {
        // ... (existing code is correct)
    }

    async function handleUnlink(itemId) {
        // ... (existing code is correct)
    }

    linkAccountBtn.addEventListener('click', () => {
        if (plaidLinkHandler) {
            plaidLinkHandler.open();
        } else {
            // If it failed, try to re-initialize on click.
            initializePlaid();
        }
    });

    accountsListContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('btn-danger')) {
            handleUnlink(target.dataset.itemId);
        }
        if (target.classList.contains('sync-btn')) {
            handleSync(target.dataset.itemId);
        }
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            fetchAndDisplayAccounts();
            initializePlaid();
        }
    });
}

document.addEventListener('DOMContentLoaded', initAccountsPage);


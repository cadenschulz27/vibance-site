// public/Accounts/accounts.js
// ---------------------------
// Handles: listing linked Plaid items, linking new accounts, syncing transactions,
// and unlinking items. Works with Netlify function '/.netlify/functions/plaid'.
// Requires: ../api/firebase.js to export { auth, db }.

// ---------- Imports ----------
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, doc, getDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---------- DOM ----------
const els = {
  list: document.getElementById('accounts-list'),
  linkBtn: document.getElementById('link-account-btn'),
  empty: document.getElementById('empty-state'),
  toast: document.getElementById('toast'),
};

// ---------- Utilities ----------
function fmtDate(value) {
  if (!value) return '—';
  const d = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function setBtnBusy(btn, busyText = 'Working…', isBusy = true) {
  if (!btn) return;
  if (isBusy) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyText;
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || btn.textContent || 'Done';
  }
}

function showToast(msg) {
  if (!els.toast) {
    console.log('[Toast]', msg);
    return;
  }
  els.toast.textContent = msg;
  els.toast.classList.remove('opacity-0', 'pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(() => {
    els.toast.classList.remove('opacity-100');
    els.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2200);
}

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return await user.getIdToken(true);
}

async function callPlaidFn(payload) {
  const idToken = await getIdToken();
  const res = await fetch('/.netlify/functions/plaid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) ${text || ''}`.trim());
  }
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

// ---------- Plaid Link loader ----------
let plaidScriptLoaded = false;
function ensurePlaidLinkLoaded() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    if (plaidScriptLoaded) {
      const i = setInterval(() => {
        if (window.Plaid) {
          clearInterval(i);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(i);
        if (!window.Plaid) reject(new Error('Plaid Link failed to load.'));
      }, 8000);
      return;
    }
    plaidScriptLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Unable to load Plaid Link script.'));
    document.head.appendChild(s);
  });
}

// ---------- Render ----------
function renderEmptyState(show) {
  if (!els.empty) return;
  els.empty.style.display = show ? '' : 'none';
}

function accountCardTemplate({ itemId, institution_name, last_synced }) {
  return `
    <div class="account-card bg-neutral-900 border border-neutral-800 rounded-xl p-4 md:p-5 shadow-md"
         data-item-id="${itemId}">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-neutral-800 grid place-content-center text-xs opacity-80">
            ${institution_name?.slice(0, 2)?.toUpperCase() || '??'}
          </div>
          <div>
            <div class="text-base md:text-lg font-semibold">${institution_name || 'Unknown Institution'}</div>
            <div class="text-xs md:text-sm opacity-70">
              Last synced:
              <span data-field="last-synced">${last_synced ? fmtDate(last_synced) : 'not synced yet'}</span>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
                  data-action="sync">Sync now</button>
          <button class="px-3 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white text-sm"
                  data-action="unlink">Unlink</button>
        </div>
      </div>
    </div>
  `;
}

function updateLastSynced(cardEl, value) {
  const el = cardEl.querySelector('[data-field="last-synced"]');
  if (el) el.textContent = value ? fmtDate(value) : '—';
}

function setSyncingState(cardEl, isSyncing) {
  const btn = cardEl.querySelector('[data-action="sync"]');
  setBtnBusy(btn, 'Syncing…', isSyncing);
  const unlink = cardEl.querySelector('[data-action="unlink"]');
  if (unlink) unlink.disabled = !!isSyncing;
}

// ---------- Firestore access ----------
async function fetchItems(uid) {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const items = [];
  snap.forEach(d => {
    const data = d.data() || {};
    items.push({
      itemId: d.id,
      institution_name: data.institution_name || data.institution || 'Unknown',
      institution_id: data.institution_id || null,
      last_synced: data.last_synced || null,
    });
  });
  return items;
}

async function refreshFromFirestore(cardEl) {
  try {
    const uid = auth.currentUser?.uid;
    const itemId = cardEl?.dataset?.itemId;
    if (!uid || !itemId) return;
    const snap = await getDoc(doc(db, 'users', uid, 'plaid_items', itemId));
    if (snap.exists()) {
      const data = snap.data();
      updateLastSynced(cardEl, data?.last_synced || null);
    }
  } catch (e) {
    console.warn('refreshFromFirestore failed', e);
  }
}

// ---------- Actions ----------
async function openPlaidLink() {
  await ensurePlaidLinkLoaded();
  const { link_token } = await callPlaidFn({ action: 'create_link_token' });

  return new Promise((resolve, reject) => {
    const handler = window.Plaid.create({
      token: link_token,
      onSuccess: async (public_token, metadata) => {
        try {
          await callPlaidFn({
            action: 'exchange_public_token',
            public_token,
            metadata: {
              institution: {
                name: metadata?.institution?.name,
                institution_id: metadata?.institution?.institution_id,
              }
            }
          });
          resolve(metadata);
        } catch (err) {
          reject(err);
        }
      },
      onExit: (err, _meta) => {
        if (err) reject(err);
        else reject(new Error('Link flow closed'));
      }
    });
    handler.open();
  });
}

async function syncItem(cardEl) {
  const itemId = cardEl.dataset.itemId;
  setSyncingState(cardEl, true);
  try {
    const result = await callPlaidFn({ action: 'sync_transactions', item_id: itemId });
    await refreshFromFirestore(cardEl);
    showToast(`Synced ✓  Added: ${result.added ?? 0} • Updated: ${result.modified ?? 0} • Removed: ${result.removed ?? 0}`);
  } catch (e) {
    console.error(e);
    showToast('Sync failed');
  } finally {
    setSyncingState(cardEl, false);
  }
}

async function unlinkItem(cardEl) {
  const itemId = cardEl.dataset.itemId;
  const confirmMsg = 'Unlink this account? You can relink later.';
  if (!window.confirm(confirmMsg)) return;

  const unlinkBtn = cardEl.querySelector('[data-action="unlink"]');
  setBtnBusy(unlinkBtn, 'Unlinking…', true);
  try {
    await callPlaidFn({ action: 'unlink_item', item_id: itemId });
    try {
      const uid = auth.currentUser?.uid;
      if (uid) await deleteDoc(doc(db, 'users', uid, 'plaid_items', itemId));
    } catch (_e) {}

    cardEl.remove();
    if (els.list && !els.list.querySelector('.account-card')) renderEmptyState(true);
    showToast('Account unlinked.');
  } catch (e) {
    console.error(e);
    showToast('Unlink failed');
  } finally {
    setBtnBusy(unlinkBtn, '', false);
  }
}

// ---------- Wiring ----------
function attachAccountCardHandlers(cardEl) {
  const syncBtn = cardEl.querySelector('[data-action="sync"]');
  const unlinkBtn = cardEl.querySelector('[data-action="unlink"]');

  if (syncBtn) {
    syncBtn.addEventListener('click', () => syncItem(cardEl).catch(err => {
      console.error(err);
      showToast(err?.message || 'Sync failed');
    }));
  }
  if (unlinkBtn) {
    unlinkBtn.addEventListener('click', () => unlinkItem(cardEl).catch(err => {
      console.error(err);
      showToast(err?.message || 'Unlink failed');
    }));
  }

  const last = cardEl.querySelector('[data-field="last-synced"]')?.textContent?.trim().toLowerCase();
  if (!last || last === '—' || last.includes('not synced yet')) {
    setTimeout(() => syncBtn?.click(), 500);
  }
}

async function renderList(uid) {
  if (!els.list) {
    console.error('Missing #accounts-list element on the page.');
    showToast('Missing #accounts-list in Accounts page');
    return;
  }

  els.list.innerHTML = '';
  const items = await fetchItems(uid);

  if (!items.length) {
    renderEmptyState(true);
    return;
  }
  renderEmptyState(false);

  for (const it of items) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = accountCardTemplate(it);
    const cardEl = wrapper.firstElementChild;
    els.list.appendChild(cardEl);
    attachAccountCardHandlers(cardEl);
  }
}

function wireLinkButton() {
  if (!els.linkBtn) return;
  els.linkBtn.addEventListener('click', async () => {
    setBtnBusy(els.linkBtn, 'Opening Plaid…', true);
    try {
      await openPlaidLink();
      showToast('Account linked! Loading…');
      const uid = auth.currentUser?.uid;
      if (uid) await renderList(uid);
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Linking failed');
    } finally {
      setBtnBusy(els.linkBtn, '', false);
    }
  });
}

// ---------- Init ----------
function init() {
  wireLinkButton();
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }
    try {
      await renderList(user.uid);
    } catch (e) {
      console.error(e);
      showToast('Failed to load accounts');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
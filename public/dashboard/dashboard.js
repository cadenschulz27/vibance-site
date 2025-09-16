// public/dashboard/dashboard.js
// ---------------------------------------
// Dashboard controller:
// - Loads recent transactions across all Plaid items
// - "Sync all" to trigger Plaid sync on every item
// - Loads business news from /.netlify/functions/getNews
//
// Requirements:
//   - ../api/firebase.js must export { auth, db }
//   - Netlify functions: /.netlify/functions/plaid, /.netlify/functions/getNews
//   - DOM elements (adjust IDs if your HTML differs):
//       #recent-activity            -> container for the transactions list
//       #recent-activity-empty      -> empty state for transactions
//       #sync-all-btn               -> button to sync all items
//       #news-list                  -> container for news cards/list
//       #news-empty                 -> empty state for news
//
// Notes:
//   - This file avoids hard coupling to VibeScore code; it can coexist with it.
//   - If you want realtime updates, you can replace fetch with onSnapshot
//     for each item’s transactions subcollection.
//
// ---------------------------------------

import { auth, db } from '../api/firebase.js';
import {
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, query, orderBy, limit, where,
  doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---------------- DOM refs (tweak selectors if needed) ----------------
const els = {
  txList: document.getElementById('recent-activity'),
  txEmpty: document.getElementById('recent-activity-empty'),
  syncAllBtn: document.getElementById('sync-all-btn'),
  newsList: document.getElementById('news-grid'), // Corrected ID
  newsEmpty: document.getElementById('news-empty'), // Now correctly references the new element
  toast: document.getElementById('toast'),
};

// ---------------- Utilities ----------------
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

function setBtnBusy(btn, text, busy = true) {
  if (!btn) return;
  if (busy) {
    btn.dataset.prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = text || 'Working…';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.prevText || 'Done';
  }
}

function fmtMoney(amount, currency = 'USD') {
  if (typeof amount !== 'number') return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function fmtDateISO(isoOrTs) {
  let d;
  if (isoOrTs?.toDate) d = isoOrTs.toDate();
  else d = new Date(isoOrTs);
  if (Number.isNaN(d?.getTime())) return '—';
  return d.toLocaleDateString();
}

function titleCase(str = '') {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildNewsCard(story) {
  const card = document.createElement('article');
  card.className = 'news-card';

  const content = document.createElement('div');
  content.className = 'news-card-content';
  card.appendChild(content);

  const topline = document.createElement('div');
  topline.className = 'news-card-topline';
  const badge = document.createElement('span');
  badge.className = 'news-card-badge';
  badge.textContent = 'Vibance Briefing';
  topline.appendChild(badge);

  if (story.method) {
    const method = document.createElement('span');
    method.className = 'news-card-method';
    method.textContent = story.method === 'llm' ? 'AI assisted' : 'Editorial blend';
    topline.appendChild(method);
  }
  content.appendChild(topline);

  const title = document.createElement('h3');
  title.className = 'news-card-title';
  title.textContent = story.headline || 'Market briefing';
  content.appendChild(title);

  if (story.summary) {
    const summary = document.createElement('p');
    summary.className = 'news-card-summary';
    summary.textContent = story.summary;
    content.appendChild(summary);
  }

  if (Array.isArray(story.keyTakeaways) && story.keyTakeaways.length) {
    const list = document.createElement('ul');
    list.className = 'news-card-takeaways';
    story.keyTakeaways.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    content.appendChild(list);
  }

  if (story.insight) {
    const insight = document.createElement('p');
    insight.className = 'news-card-insight';
    insight.textContent = story.insight;
    content.appendChild(insight);
  }

  const meta = document.createElement('div');
  meta.className = 'news-card-meta';

  if (story.sentiment) {
    const sentiment = document.createElement('span');
    sentiment.className = `news-card-sentiment news-card-sentiment--${story.sentiment}`;
    sentiment.textContent = `${titleCase(story.sentiment)} tone`;
    meta.appendChild(sentiment);
  }

  if (story.riskLevel) {
    const risk = document.createElement('span');
    risk.className = 'news-card-risk';
    risk.textContent = story.riskLevel;
    meta.appendChild(risk);
  }

  if (Array.isArray(story.tickers) && story.tickers.length) {
    const tickersWrap = document.createElement('div');
    tickersWrap.className = 'news-card-tickers';
    const label = document.createElement('span');
    label.className = 'news-card-tickers-label';
    label.textContent = 'Tickers:';
    tickersWrap.appendChild(label);

    story.tickers.slice(0, 6).forEach((ticker) => {
      const badge = document.createElement('span');
      badge.className = 'news-card-ticker';
      badge.textContent = ticker;
      tickersWrap.appendChild(badge);
    });

    meta.appendChild(tickersWrap);
  }

  if (meta.children.length) {
    content.appendChild(meta);
  }

  const source = document.createElement('div');
  source.className = 'news-card-source';

  const sourceLabel = document.createElement('span');
  sourceLabel.textContent = 'Source: ';
  source.appendChild(sourceLabel);

  if (story.attribution?.url) {
    const link = document.createElement('a');
    link.href = story.attribution.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = story.attribution?.source || 'Original reporting';
    source.appendChild(link);
  } else if (story.attribution?.source) {
    const span = document.createElement('span');
    span.textContent = story.attribution.source;
    source.appendChild(span);
  } else {
    const span = document.createElement('span');
    span.textContent = 'Vibance Research Desk';
    source.appendChild(span);
  }

  if (story.publishedAt) {
    const published = new Date(story.publishedAt);
    if (!Number.isNaN(published.getTime())) {
      const divider = document.createElement('span');
      divider.className = 'news-card-source-divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.textContent = ' • ';
      source.appendChild(divider);

      const time = document.createElement('time');
      time.dateTime = published.toISOString();
      time.textContent = fmtDateISO(published);
      source.appendChild(time);
    }
  }

  content.appendChild(source);

  return card;
}

async function getIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  return await user.getIdToken(true);
}

async function callFn(path, payload) {
  const token = await getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: payload ? JSON.stringify(payload) : '{}',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`${path} failed (${res.status}) ${t}`);
  }
  return await res.json();
}

// ---------------- Plaid items & transactions ----------------
async function listPlaidItems(uid) {
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  const out = [];
  snap.forEach(d => {
    const x = d.data() || {};
    out.push({
      id: d.id,
      institution_name: x.institution_name || x.institution || 'Unknown',
      last_synced: x.last_synced || null,
    });
  });
  return out;
}

/**
 * Fetch recent transactions across all items for a user.
 * @param {string} uid
 * @param {object} options { days: number, perItemLimit: number, overallLimit: number }
 */
async function fetchRecentTransactions(uid, options = {}) {
  const days = options.days ?? 30;
  const perItemLimit = options.perItemLimit ?? 50;    // per item safeguard
  const overallLimit = options.overallLimit ?? 100;   // after merge, cap to this

  const items = await listPlaidItems(uid);
  const since = new Date();
  since.setDate(since.getDate() - days);

  // For each item, pull recent docs ordered by date desc
  const all = [];
  for (const it of items) {
    const txRef = collection(db, 'users', uid, 'plaid_items', it.id, 'transactions');
    // Many schemas store date as string (YYYY-MM-DD) or Timestamp; we’ll try both:
    // Primary: if 'date' is a string (ISO-like), we can only order by it, not compare Date.
    // Safer approach: just order by 'date' desc and take perItemLimit; filter later.
    const qTx = query(txRef, orderBy('date', 'desc'), limit(perItemLimit));
    const snap = await getDocs(qTx);
    snap.forEach(docSnap => {
      const d = docSnap.data() || {};
      all.push({
        id: docSnap.id,
        itemId: it.id,
        institution_name: it.institution_name,
        date: d.date || d.authorized_date || d.posted_at || d.timestamp || null,
        name: d.name || d.merchant_name || d.description || 'Transaction',
        amount: (typeof d.amount === 'number' ? d.amount : Number(d.amount)) || 0,
        isoCurrency: d.iso_currency_code || d.currency || 'USD',
        pending: !!d.pending,
        category: Array.isArray(d.category) ? d.category : (d.category ? [d.category] : []),
        raw: d,
      });
    });
  }

  // Normalize and sort by date desc (treat strings as ISO if possible)
  const withEpoch = all.map(t => {
    const dt = t.date ? new Date(t.date) : null;
    const epoch = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : 0;
    return { ...t, _epoch: epoch };
  });

  withEpoch.sort((a, b) => b._epoch - a._epoch);

  // Optional filter by last N days if dates parse
  const cutoff = since.getTime();
  const filtered = withEpoch.filter(t => !cutoff || (t._epoch && t._epoch >= cutoff));

  // Cap to overallLimit for UI performance
  return filtered.slice(0, overallLimit);
}

function renderTransactions(list) {
  if (!els.txList) return;

  els.txList.innerHTML = '';
  if (!Array.isArray(list) || list.length === 0) {
    if (els.txEmpty) els.txEmpty.style.display = '';
    return;
  }
  if (els.txEmpty) els.txEmpty.style.display = 'none';

  // Group by calendar day for nicer reading
  const groups = new Map();
  for (const t of list) {
    const label = t._epoch ? new Date(t._epoch).toDateString() : 'Unknown date';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(t);
  }

  // Render sections by day
  const dayLabels = Array.from(groups.keys());
  for (const day of dayLabels) {
    const daySection = document.createElement('section');
    daySection.className = 'mb-6';
    daySection.innerHTML = `
      <h3 class="text-sm uppercase tracking-wider text-neutral-400 mb-2">${day}</h3>
      <div class="divide-y divide-neutral-800 rounded-lg overflow-hidden bg-neutral-900/60 border border-neutral-800">
      </div>
    `;
    const container = daySection.querySelector('div');

    for (const tx of groups.get(day)) {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900';
      row.innerHTML = `
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="inline-flex h-6 w-6 rounded-full bg-neutral-800 grid place-content-center text-[10px] opacity-70">
              ${tx.institution_name?.slice(0, 2)?.toUpperCase() || 'XX'}
            </span>
            <div class="truncate font-medium">${tx.name || 'Transaction'}</div>
            ${tx.pending ? '<span class="text-amber-400 text-xs ml-2">Pending</span>' : ''}
          </div>
          <div class="text-xs text-neutral-400 truncate">
            ${tx.category?.join(' • ') || '—'}
          </div>
        </div>
        <div class="text-right">
          <div class="font-semibold ${tx.amount < 0 ? 'text-emerald-400' : 'text-red-400'}">
            ${fmtMoney(Math.abs(tx.amount), tx.isoCurrency)}
          </div>
          <div class="text-xs text-neutral-400">${fmtDateISO(tx.date)}</div>
        </div>
      `;
      container.appendChild(row);
    }

    els.txList.appendChild(daySection);
  }
}

// ---------------- Sync all ----------------
async function syncAll(uid) {
  setBtnBusy(els.syncAllBtn, 'Syncing…', true);
  try {
    const items = await listPlaidItems(uid);
    if (!items.length) {
      showToast('No linked accounts yet.');
      return;
    }

    let added = 0, modified = 0, removed = 0, failures = 0;

    for (const it of items) {
      try {
        const res = await callFn('/.netlify/functions/plaid', {
          action: 'sync_transactions',
          item_id: it.id,
        });
        added += res?.addedCount || 0;
        modified += res?.modifiedCount || 0;
        removed += res?.removedCount || 0;
      } catch (e) {
        console.error('Sync failed for item', it.id, e);
        failures++;
      }
    }

    showToast(`Sync complete ✓  +${added} • ~${modified} • –${removed}` + (failures ? `  (${failures} failed)` : ''));
  } finally {
    setBtnBusy(els.syncAllBtn, '', false);
  }
}

// ---------------- News ----------------
async function loadNews() {
  if (!els.newsList) return;

  els.newsList.innerHTML = '';
  try {
    // getNews function expects POST (keeps API key server-side)
    const res = await fetch('/.netlify/functions/getNews', { method: 'POST' });
    if (!res.ok) throw new Error(`getNews failed (${res.status})`);
    const data = await res.json();

    const stories = Array.isArray(data?.stories) ? data.stories : [];
    if (!stories.length) {
      if (els.newsEmpty) els.newsEmpty.style.display = '';
      return;
    }
    if (els.newsEmpty) els.newsEmpty.style.display = 'none';

    stories.forEach((story) => {
      const card = buildNewsCard(story);
      els.newsList.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    if (els.newsEmpty) els.newsEmpty.style.display = '';
  }
}

// ---------------- Init ----------------
async function loadDashboard(uid) {
  // Load transactions
  const tx = await fetchRecentTransactions(uid, { days: 30, perItemLimit: 50, overallLimit: 120 });
  renderTransactions(tx);

  // Load news (no auth required, but do it after transactions)
  loadNews().catch(() => {});
}

function wire() {
  if (els.syncAllBtn) {
    els.syncAllBtn.addEventListener('click', async () => {
      const user = auth.currentUser;
      if (!user) return;
      await syncAll(user.uid);
      // After syncing, refresh the recent transactions list
      const tx = await fetchRecentTransactions(user.uid, { days: 30, perItemLimit: 50, overallLimit: 120 });
      renderTransactions(tx);
    });
  }
}

function init() {
  wire();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // Your auth-check.js likely redirects; we no-op here.
      return;
    }
    try {
      await loadDashboard(user.uid);
    } catch (e) {
      console.error('Dashboard load failed', e);
      showToast('Failed to load dashboard');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

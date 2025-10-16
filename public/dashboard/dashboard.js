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
  newsDisclaimer: document.getElementById('news-disclaimer'),
  toast: document.getElementById('toast'),
};

const modalEls = {
  container: document.getElementById('news-modal'),
  overlay: document.getElementById('news-modal-overlay'),
  panel: document.getElementById('news-modal-panel'),
  closeBtn: document.getElementById('news-modal-close'),
  badge: document.getElementById('news-modal-badge'),
  title: document.getElementById('news-modal-title'),
  date: document.getElementById('news-modal-date'),
  summary: document.getElementById('news-modal-summary'),
  takeawaysSection: document.getElementById('news-modal-takeaways-section'),
  takeaways: document.getElementById('news-modal-takeaways'),
  perspectiveSection: document.getElementById('news-modal-perspective-section'),
  perspective: document.getElementById('news-modal-perspective'),
  source: document.getElementById('news-modal-source'),
  compliance: document.getElementById('news-modal-compliance'),
  advisorSection: document.getElementById('news-modal-advisor-section'),
  advisor: document.getElementById('news-modal-advisor'),
};

let newsStories = [];
let activeStoryId = null;
let latestTransactions = [];

let newsAdvisorAbortController = null;

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
    btn.dataset.prevHtml = btn.innerHTML;
    btn.disabled = true;
    if (/<[^>]+>/.test(String(text || ''))) btn.innerHTML = String(text);
    else btn.innerHTML = '<img src="/images/sync-icon.svg" alt="Syncing" class="sync-icon spinning">';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.prevHtml || (btn.dataset.prevText || 'Done');
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

function fmtDateLong(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d?.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildNewsCard(story) {
  const card = document.createElement('article');
  card.className = 'news-card';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'news-card-trigger';
  trigger.setAttribute('aria-label', `Open Vibance briefing: ${story.headline || 'Market briefing'}`);

  const preview = document.createElement('div');
  preview.className = 'news-card-preview';

  const topline = document.createElement('div');
  topline.className = 'news-card-topline';
  const badge = document.createElement('span');
  badge.className = 'news-card-badge';
  badge.textContent = 'Vibance Briefing';
  topline.appendChild(badge);

  const readable = fmtDateLong(story.publishedAt);
  if (readable) {
    const time = document.createElement('time');
    time.className = 'news-card-date';
    time.dateTime = new Date(story.publishedAt).toISOString();
    time.textContent = readable;
    topline.appendChild(time);
  }

  preview.appendChild(topline);

  const title = document.createElement('h3');
  title.className = 'news-card-title';
  title.textContent = story.headline || 'Market briefing';
  preview.appendChild(title);

  const hint = document.createElement('span');
  hint.className = 'news-card-hint';
  hint.textContent = 'Open briefing';
  preview.appendChild(hint);

  trigger.appendChild(preview);
  trigger.addEventListener('click', () => openNewsModal(story));

  card.appendChild(trigger);
  return card;
}

function resetNewsModal() {
  if (!modalEls.container) return;
  if (modalEls.title) modalEls.title.textContent = '';
  if (modalEls.date) {
    modalEls.date.textContent = '';
    modalEls.date.style.display = 'none';
  }
  if (modalEls.summary) modalEls.summary.textContent = '';
  if (modalEls.takeaways) modalEls.takeaways.innerHTML = '';
  if (modalEls.takeawaysSection) modalEls.takeawaysSection.style.display = 'none';
  if (modalEls.perspective) modalEls.perspective.textContent = '';
  if (modalEls.perspectiveSection) modalEls.perspectiveSection.style.display = 'none';
  if (modalEls.advisor) modalEls.advisor.textContent = '';
  if (modalEls.advisorSection) modalEls.advisorSection.style.display = 'none';
  if (modalEls.source) {
    modalEls.source.textContent = '';
    modalEls.source.removeAttribute('href');
    modalEls.source.style.display = 'none';
  }
  if (modalEls.compliance) {
    modalEls.compliance.textContent = '';
    modalEls.compliance.style.display = 'none';
  }
}

function closeNewsModal() {
  if (!modalEls.container) return;
  modalEls.container.classList.remove('news-modal--open');
  modalEls.container.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  resetNewsModal();
  activeStoryId = null;
  document.removeEventListener('keydown', handleModalKeydown, true);
  if (newsAdvisorAbortController) {
    newsAdvisorAbortController.abort();
    newsAdvisorAbortController = null;
  }
}

function handleModalKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeNewsModal();
  }
}

function buildAdvisorPayload(story = {}) {
  return {
    headline: story.headline || null,
    summary: story.summary || null,
    takeaways: Array.isArray(story.keyTakeaways) ? story.keyTakeaways.slice(0, 4) : [],
    insight: story.insight || null,
    sentiment: story.sentiment || null,
    riskLevel: story.riskLevel || null,
    attribution: story.attribution?.source || story.attribution?.url || null,
    publishedAt: story.publishedAt || null,
  };
}

async function loadNewsAdvisor(story) {
  if (!modalEls.advisorSection || !modalEls.advisor) return;
  if (!story?.summary) {
    modalEls.advisorSection.style.display = 'none';
    return;
  }

  if (newsAdvisorAbortController) {
    newsAdvisorAbortController.abort();
  }

  const controller = new AbortController();
  newsAdvisorAbortController = controller;

  modalEls.advisorSection.style.display = '';
  modalEls.advisor.textContent = 'Consulting Cohere…';

  const storyToken = story?.id || story?.headline || story?.publishedAt || null;

  try {
    const res = await fetch('/.netlify/functions/ai-openadvisor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAdvisorPayload(story)),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Advisor request failed (${res.status})`);
    }

    let data = null;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error('Invalid advisor response');
    }

  if (controller.signal.aborted) return;
  if (activeStoryId && storyToken && activeStoryId !== storyToken) return;

    const tip = typeof data?.tip === 'string'
      ? data.tip.trim()
      : typeof data?.advisor === 'string'
        ? data.advisor.trim()
        : '';

    if (tip) {
      modalEls.advisor.textContent = tip;
      modalEls.advisorSection.style.display = '';
    } else {
      modalEls.advisor.textContent = 'No concierge insight available. Review the summary above.';
      modalEls.advisorSection.style.display = '';
    }
  } catch (err) {
    if (controller.signal.aborted) return;
    console.warn('Advisor note failed', err);
    if (modalEls.advisor) {
      modalEls.advisor.textContent = 'Unable to fetch an advisor note right now.';
      modalEls.advisorSection.style.display = '';
    }
  } finally {
    if (newsAdvisorAbortController === controller) {
      newsAdvisorAbortController = null;
    }
  }
}

function openNewsModal(story) {
  if (!modalEls.container) return;
  resetNewsModal();
  const storyToken = story?.id || story?.headline || story?.publishedAt || null;
  activeStoryId = storyToken;

  if (modalEls.badge) modalEls.badge.textContent = 'Vibance Briefing';

  if (modalEls.title) {
    modalEls.title.textContent = story.headline || 'Market briefing';
  }

  const readableDate = fmtDateLong(story.publishedAt);
  if (modalEls.date) {
    if (readableDate) {
      modalEls.date.textContent = readableDate;
      modalEls.date.dateTime = new Date(story.publishedAt).toISOString();
      modalEls.date.style.display = '';
    } else {
      modalEls.date.style.display = 'none';
    }
  }

  if (modalEls.summary) {
    modalEls.summary.textContent = story.summary || '';
  }

  if (Array.isArray(story.keyTakeaways) && story.keyTakeaways.length && modalEls.takeaways && modalEls.takeawaysSection) {
    story.keyTakeaways.forEach((item) => {
      if (!item) return;
      const li = document.createElement('li');
      li.textContent = item;
      modalEls.takeaways.appendChild(li);
    });
    modalEls.takeawaysSection.style.display = modalEls.takeaways.children.length ? '' : 'none';
  }

  if (story.insight && modalEls.perspective && modalEls.perspectiveSection) {
    modalEls.perspective.textContent = story.insight;
    modalEls.perspectiveSection.style.display = '';
  }

  if (modalEls.source) {
    if (story.attribution?.url) {
      modalEls.source.href = story.attribution.url;
      modalEls.source.textContent = 'Read the original report';
      modalEls.source.style.display = '';
    } else if (story.attribution?.source) {
      modalEls.source.removeAttribute('href');
      modalEls.source.textContent = story.attribution.source;
      modalEls.source.style.display = '';
    } else {
      modalEls.source.style.display = 'none';
    }
  }

  if (story.complianceNote && modalEls.compliance) {
    modalEls.compliance.textContent = story.complianceNote;
    modalEls.compliance.style.display = '';
  }

  modalEls.container.classList.add('news-modal--open');
  modalEls.container.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  if (modalEls.closeBtn) {
    modalEls.closeBtn.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', handleModalKeydown, true);

  loadNewsAdvisor(story);
}

function bindNewsModal() {
  if (!modalEls.container) return;
  if (modalEls.overlay) {
    modalEls.overlay.addEventListener('click', () => closeNewsModal());
  }
  if (modalEls.closeBtn) {
    modalEls.closeBtn.addEventListener('click', () => closeNewsModal());
  }
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
    if (els.newsDisclaimer) {
      const disclaimerText = data?.meta?.disclaimer || '';
      els.newsDisclaimer.textContent = disclaimerText;
      els.newsDisclaimer.style.display = disclaimerText ? '' : 'none';
    }
    newsStories = stories;
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
  latestTransactions = tx;

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
      latestTransactions = tx;
    });
  }
}

function init() {
  bindNewsModal();
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

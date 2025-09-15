// /public/admin/users.js
// Admin Users — presence-aware list + RBAC editor

import { auth, db } from '/api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, onSnapshot, query, limit as qLimit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const ADMIN_EMAIL = 'cadenschulz@gmail.com';

// Elements
const gate = document.getElementById('gate');
const toolbar = document.getElementById('toolbar');
const tableWrap = document.getElementById('tableWrap');
const tbody = document.getElementById('tbody');
const pageMeta = document.getElementById('pageMeta');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');

const searchEl = document.getElementById('search');
const filterVerifiedEl = document.getElementById('filter-verified');
const filterStatusEl = document.getElementById('filter-status');

// Drawer
const drawer = document.getElementById('drawer');
const dClose = document.getElementById('d-close');
const dEmail = document.getElementById('d-email');
const dBody = document.getElementById('d-body');
const dMsg = document.getElementById('d-msg');
const dToggleDisabled = document.getElementById('d-toggle-disabled');
const dSetActive = document.getElementById('d-status-active');
const dSetSuspended = document.getElementById('d-status-suspended');
const dSetFlagged = document.getElementById('d-status-flagged');
const dDelete = document.getElementById('d-delete');

let state = {
  token: null,
  pageToken: null,
  lastPageTokens: [],
  rows: [],
  presenceUnsub: null
};

// UI helpers
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }
function badge(bool, yes='Verified', no='Unverified') {
  return `<span class="chip ${bool ? 'chip-yes' : 'chip-no'}">${bool ? yes : no}</span>`;
}
function fmtDate(s) { if (!s) return ''; const d = new Date(s); return d.toLocaleString(); }

// Presence: consider offline if lastSeenAt is stale (>60s)
function presenceBadge(presence, lastSeenAt) {
  const onlineFlag = !!(presence && presence.online);
  const last = lastSeenAt?.toDate ? lastSeenAt.toDate() : lastSeenAt ? new Date(lastSeenAt) : null;
  const ageMs = last ? (Date.now() - last.getTime()) : Number.POSITIVE_INFINITY;
  const consideredOnline = onlineFlag && ageMs < 60000;
  if (consideredOnline) return `<span class="chip chip-yes">Online</span>`;
  const mins = isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 60000)) : '–';
  return `<span class="chip chip-no">Offline · ${mins}m</span>`;
}

// SINGLE definition — admin gate (custom claim OR fallback email)
async function ensureAdmin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (u) => {
      if (!u) {
        gate.innerHTML = `<div class="p-2">Please <a href="/login.html" class="underline">sign in</a>.</div>`;
        show(gate); return resolve(false);
      }
      await u.reload();
      const idTokRes = await u.getIdTokenResult(true);
      const hasClaim = !!(idTokRes?.claims?.roles && idTokRes.claims.roles.admin === true);
      const isEmailAdmin = ((u.email || '').toLowerCase() === ADMIN_EMAIL);
      if (!hasClaim && !isEmailAdmin) {
        gate.innerHTML = `<div class="p-2">Access denied.</div>`;
        show(gate); return resolve(false);
      }
      state.token = idTokRes.token;
      hide(gate); show(toolbar); show(tableWrap);
      resolve(true);
    });
  });
}

async function api(path, opts={}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${state.token}`, ...(opts.headers || {}) }
  });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function renderRows(rows, nextPageToken) {
  state.rows = rows;
  state.pageToken = nextPageToken;

  tbody.innerHTML = rows.map(r => `
    <tr class="row border-t border-white/10" data-uid="${r.uid}">
      <td class="px-4 py-3">${r.email || ''}</td>
      <td class="px-4 py-3">${r.username || ''}</td>
      <td class="px-4 py-3" data-presence="${r.uid}">—</td>
      <td class="px-4 py-3">${badge(!!r.emailVerified)}</td>
      <td class="px-4 py-3">${badge(!!r.disabled, r.disabled ? 'Disabled' : 'Enabled', r.disabled ? 'Disabled' : 'Enabled')}</td>
      <td class="px-4 py-3">${r.status || ''}</td>
      <td class="px-4 py-3">${fmtDate(r.createdAt)}</td>
      <td class="px-4 py-3 text-right">
        <button class="btn-ghost" data-open="${r.uid}">Manage</button>
      </td>
    </tr>
  `).join('');

  pageMeta.textContent = nextPageToken ? 'More available…' : 'End of list';

  [...tbody.querySelectorAll('[data-open]')].forEach(btn => {
    btn.addEventListener('click', () => openDrawer(btn.getAttribute('data-open')));
  });

  attachPresenceListener();
}

function attachPresenceListener() {
  if (state.presenceUnsub) { state.presenceUnsub(); state.presenceUnsub = null; }
  const qy = query(collection(db, 'users_index'), qLimit(500));
  state.presenceUnsub = onSnapshot(qy, (snap) => {
    snap.docChanges().forEach((ch) => {
      const uid = ch.doc.id;
      const d = ch.doc.data() || {};
      const cell = tbody.querySelector(`[data-presence="${uid}"]`);
      if (!cell) return;
      cell.innerHTML = presenceBadge(d.presence || null, d.lastSeenAt || null);
    });
  });
}

// Uses Admin SDK list endpoint via Netlify
async function load(pageToken=null) {
  const s = (searchEl.value || '').trim();
  const v = filterVerifiedEl.value;
  const st = filterStatusEl.value;

  // Use new search endpoint when search/filters are present
  if (s || v || st) {
    const q = new URLSearchParams();
    if (s) q.set('q', s);
    if (s.includes('@')) q.set('field', 'email'); // exact
    // Optional: force mode via field= 'username' | 'name'
    if (v) q.set('verified', v);
    if (st) q.set('status', st);
    q.set('limit', '50');

    const data = await api('/.netlify/functions/admin-search-users?' + q.toString());
    renderRows(data.users || [], null);
    return;
  }

  // Fallback to simple list (no search/filters)
  const q = new URLSearchParams();
  q.set('limit', '50');
  q.set('includeUsername', 'true');
  if (pageToken) q.set('pageToken', pageToken);

  const data = await api('/.netlify/functions/admin-list-users?' + q.toString());
  renderRows(data.users || [], data.nextPageToken || null);
}


async function openDrawer(uid) {
  try {
    dMsg.textContent = '';
    const u = await api('/.netlify/functions/admin-get-user?uid=' + encodeURIComponent(uid));

    dEmail.textContent = u.email || uid;
    dBody.innerHTML = `
      <div><strong>UID:</strong> ${u.uid}</div>
      <div><strong>Email:</strong> ${u.email || ''}</div>
      <div><strong>Verified:</strong> ${u.emailVerified ? 'Yes' : 'No'}</div>
      <div><strong>Disabled:</strong> ${u.disabled ? 'Yes' : 'No'}</div>
      <div><strong>Username:</strong> ${u.username || ''}</div>
      <div><strong>First name:</strong> ${u.firstName || ''}</div>
      <div><strong>Last name:</strong> ${u.lastName || ''}</div>
      <div><strong>Status:</strong> ${u.status || ''}</div>
      <div><strong>Created:</strong> ${u.createdAt ? new Date(u.createdAt).toLocaleString() : ''}</div>
      <div><strong>Last sign-in:</strong> ${u.lastSignIn ? new Date(u.lastSignIn).toLocaleString() : ''}</div>
      <div><strong>Providers:</strong> ${(u.providers||[]).map(p=>p.providerId).join(', ') || '—'}</div>
      <div><strong>Tokens valid after:</strong> ${u.tokensValidAfterTime || '—'}</div>
    `;

    // Roles editor
    const roles = u.rolesClaims || u.rolesProfile || { admin:false, moderator:false, support:false, readOnlyAdmin:false };
    const rolesDiv = document.createElement('div');
    rolesDiv.className = 'mt-3 p-3 rounded-xl border border-white/10';
    rolesDiv.innerHTML = `
      <div class="font-semibold mb-2">Roles</div>
      <label class="block mb-1"><input type="checkbox" id="r-admin" ${roles.admin ? 'checked' : ''}/> <span class="ml-1">Admin</span></label>
      <label class="block mb-1"><input type="checkbox" id="r-mod" ${roles.moderator ? 'checked' : ''}/> <span class="ml-1">Moderator</span></label>
      <label class="block mb-1"><input type="checkbox" id="r-support" ${roles.support ? 'checked' : ''}/> <span class="ml-1">Support</span></label>
      <label class="block mb-2"><input type="checkbox" id="r-ro" ${roles.readOnlyAdmin ? 'checked' : ''}/> <span class="ml-1">Read-only admin</span></label>
      <button id="roles-save" class="btn-ghost">Save roles</button>
      <p class="text-xs text-gray-400 mt-1">Note: user must sign out/in (or we revoke sessions) to receive new claims.</p>
    `;
    dBody.appendChild(rolesDiv);
    document.getElementById('roles-save').onclick = async () => {
      const patch = {
        admin: document.getElementById('r-admin').checked,
        moderator: document.getElementById('r-mod').checked,
        support: document.getElementById('r-support').checked,
        readOnlyAdmin: document.getElementById('r-ro').checked
      };
      await updateRoles(uid, patch);
    };

    // Main buttons
    dToggleDisabled.textContent = u.disabled ? 'Enable User' : 'Disable User';
    dToggleDisabled.onclick = () => updateUser(uid, { disabled: !u.disabled });
    dSetActive.onclick = () => updateUser(uid, { status: 'active' });
    dSetSuspended.onclick = () => updateUser(uid, { status: 'suspended' });
    dSetFlagged.onclick = () => updateUser(uid, { status: 'flagged' });
    dDelete.onclick = () => deleteUser(uid);

    // Extra admin actions
    const extra = document.createElement('div');
    extra.className = 'text-xs text-gray-300';
    extra.innerHTML = `
      <button id="mark-verified" class="btn-ghost">${u.emailVerified ? 'Unverify' : 'Mark Verified'}</button>
      <button id="revoke" class="btn-ghost">Revoke Sessions</button>
    `;
    dBody.appendChild(extra);
    document.getElementById('mark-verified').onclick = () => updateUser(uid, { markVerified: !u.emailVerified });
    document.getElementById('revoke').onclick = () => updateUser(uid, { revokeSessions: true });

    drawer.showModal();
  } catch (e) {
    dMsg.textContent = e.message || 'Failed to load user.';
  }
}

async function updateUser(uid, patch) {
  try {
    dMsg.textContent = 'Saving…';
    const res = await fetch('/.netlify/functions/admin-update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ uid, ...patch })
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to update');
    dMsg.textContent = 'Saved.';
    await load();
  } catch (e) {
    dMsg.textContent = e.message || 'Failed.';
  }
}

async function updateRoles(uid, roles) {
  try {
    dMsg.textContent = 'Saving roles…';
    const res = await fetch('/.netlify/functions/admin-set-roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ uid, roles })
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to set roles');
    dMsg.textContent = 'Roles saved.';
    await load();
  } catch (e) {
    dMsg.textContent = e.message || 'Failed to set roles.';
  }
}

async function deleteUser(uid) {
  if (!confirm('Delete this user? This cannot be undone.')) return;
  try {
    dMsg.textContent = 'Deleting…';
    const res = await fetch('/.netlify/functions/admin-update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
      body: JSON.stringify({ uid, delete: true })
    });
    const data = await res.json().catch(()=> ({}));
    if (!res.ok) throw new Error(data?.error || 'Failed to delete');
    dMsg.textContent = 'Deleted.';
    drawer.close();
    await load();
  } catch (e) {
    dMsg.textContent = e.message || 'Failed.';
  }
}

// Paging + filters
nextBtn.addEventListener('click', async () => {
  if (state.pageToken) { state.lastPageTokens.push(state.pageToken); await load(state.pageToken); }
});
prevBtn.addEventListener('click', async () => {
  const prev = state.lastPageTokens.pop(); await load(prev || null);
});
document.getElementById('btn-refresh').addEventListener('click', () => load());
searchEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
filterVerifiedEl.addEventListener('change', () => load());
filterStatusEl.addEventListener('change', () => load());
dClose.addEventListener('click', () => drawer.close());

// INIT
if (await ensureAdmin()) {
  load().catch(e => {
    tbody.innerHTML = `<tr><td class="px-4 py-3" colspan="8">API error: ${e.message}</td></tr>`;
  });
}

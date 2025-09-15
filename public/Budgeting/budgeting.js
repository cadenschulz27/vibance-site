// public/Budgeting/budgeting.js
// --------------------------------------------------------------------
// Vibance • Budgeting + Plaid (Pro) — with On-Demand Netlify Sync
// --------------------------------------------------------------------
// Enhancements vs prior version:
// - "Sync Now" now POSTS to Netlify function `/.netlify/functions/plaid-sync`
//   with the user’s Firebase ID token and current month (YYYY-MM).
// - After server sync completes, we invalidate local cache and recompute.
// - Robust UI feedback (toast + last-synced indicator).
// --------------------------------------------------------------------

import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, deleteDoc,
  serverTimestamp, query, orderBy, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* --------------------------------- DOM --------------------------------- */
const els = {
  month: document.getElementById('month-select'),

  addName: document.getElementById('add-name'),
  addAmount: document.getElementById('add-amount'),
  addBtn: document.getElementById('add-btn'),

  list: document.getElementById('cat-list'),

  totalBudgeted: document.getElementById('totals-budgeted'),
  totalSpent: document.getElementById('totals-spent'),
  totalRemaining: document.getElementById('totals-remaining'),
  totalProgress: document.getElementById('totals-progress'),

  exportCsv: document.getElementById('export-csv'),
  template: document.getElementById('category-row-template'),
  toast: document.getElementById('toast'),
};

injectAdvancedControls();

/* ------------------------------- State --------------------------------- */
let UID = null;
let CURRENT_MONTH = yyyyMm(new Date());
let CATEGORIES = [];      // [{id,name,amount}]
let CONFIG = defaultConfig();
let TX_CACHE = {};        // `${UID}:${YYYY-MM}` -> { tx, spentMap, meta }
let SPENT = {};           // { budgetCategory: number }
let TOTALS = { budgeted: 0, spent: 0, remaining: 0 };

/* ------------------------------ Config --------------------------------- */
function defaultConfig() {
  return {
    categoryMappings: {},
    merchantRules: [],
    ignoredCategories: ['Transfer'],
    excludeTransfers: true,
    excludePending: true,
    includeRefunds: false,
    lastUI: { tag: 'all' },
  };
}
async function loadConfig(uid) {
  try {
    const ref = doc(db, 'users', uid, 'settings', 'budgeting');
    const snap = await getDoc(ref);
    if (snap.exists()) CONFIG = { ...defaultConfig(), ...(snap.data() || {}) };
    else await setDoc(ref, { ...CONFIG, createdAt: serverTimestamp() }, { merge: true });
  } catch (e) { console.warn('[budget] loadConfig', e); }
}
async function saveConfigPartial(uid, patch) {
  try {
    const ref = doc(db, 'users', uid, 'settings', 'budgeting');
    await setDoc(ref, patch, { merge: true });
    CONFIG = { ...CONFIG, ...patch };
  } catch (e) { console.warn('[budget] saveConfigPartial', e); }
}

/* ------------------------------ Helpers -------------------------------- */
function yyyyMm(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { start: new Date(y, m-1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
}
function money(n, currency='USD') {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(n);
}
const norm = (s) => (s||'').toString().trim().replace(/\s+/g,' ');
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function toast(msg){
  if (!els.toast) return console.log('[toast]', msg);
  els.toast.textContent=msg;
  els.toast.classList.remove('opacity-0','pointer-events-none');
  els.toast.classList.add('opacity-100');
  setTimeout(()=>els.toast.classList.add('opacity-0','pointer-events-none'),1800);
}

/* --------------------------- Firestore I/O ------------------------------ */
function monthDocRef(uid, ym){ return doc(db,'users',uid,'budgets',ym); }
function monthCatsCol(uid, ym){ return collection(db,'users',uid,'budgets',ym,'categories'); }
async function ensureMonthDoc(uid, ym){
  const ref = monthDocRef(uid, ym);
  const snap = await getDoc(ref);
  if (!snap.exists()) await setDoc(ref, { month: ym, createdAt: serverTimestamp() }, { merge:true });
}
async function loadCategories(uid, ym){
  await ensureMonthDoc(uid, ym);
  const snap = await getDocs(query(monthCatsCol(uid, ym), orderBy('name')));
  return snap.docs.map(d => ({ id:d.id, name:d.data().name||'Unnamed', amount:num(d.data().amount) }));
}
async function createCategory(uid, ym, name, amount){
  await ensureMonthDoc(uid, ym);
  const res = await addDoc(monthCatsCol(uid, ym), { name: norm(name), amount: num(amount) });
  return res.id;
}
async function updateCategory(uid, ym, id, patch){
  const ref = doc(db, 'users', uid, 'budgets', ym, 'categories', id);
  await setDoc(ref, { ...patch }, { merge:true });
}
async function removeCategory(uid, ym, id){
  const ref = doc(db, 'users', uid, 'budgets', ym, 'categories', id);
  await deleteDoc(ref);
}

/* -------------------- Plaid data (from Firestore) ---------------------- */
async function listItemIds(uid){
  const ref = collection(db, 'users', uid, 'plaid_items');
  const snap = await getDocs(ref);
  return snap.docs.map(d => d.id);
}
function categoryIsIgnored(tx){
  const cats = Array.isArray(tx.category)?tx.category:(tx.category?[tx.category]:[]);
  if (!cats.length) return false;
  const line = cats.join(' / ').toLowerCase();
  return (CONFIG.ignoredCategories||[]).some(k=>line.includes(k.toLowerCase()));
}
function isExcludedByType(name, plaidType, amount){
  const nm=(name||'').toLowerCase();
  if (CONFIG.excludeTransfers){
    if (plaidType && /transfer/i.test(plaidType)) return true;
    if (/payment|credit card payment|cc payment|autopay/.test(nm)) return true;
    if (/venmo transfer|cash app|zelle/.test(nm)) return true;
    if (/transfer to|transfer from|balance transfer/.test(nm)) return true;
  }
  if (!CONFIG.includeRefunds && amount < 0) return true;
  return false;
}
function resolveBudgetCategory(tx){
  const userCat = norm(tx.categoryUser);
  if (userCat) return userCat;
  // merchant rules
  const merchant = norm(tx.merchant || tx.name);
  for (const rule of (CONFIG.merchantRules||[])) {
    try{ const re=new RegExp(rule.pattern,'i'); if (re.test(merchant)) return norm(rule.budgetCategory); }catch{}
  }
  // category mappings
  const plaidPath = Array.isArray(tx.category) ? tx.category.join(' / ') : norm(tx.category);
  if (CONFIG.categoryMappings[plaidPath]) return norm(CONFIG.categoryMappings[plaidPath]);
  const segs = Array.isArray(tx.category) ? tx.category : (plaidPath?plaidPath.split('/') : []);
  for (const seg of segs){ const s=norm(seg); if (CONFIG.categoryMappings[s]) return norm(CONFIG.categoryMappings[s]); }
  for (const key in CONFIG.categoryMappings){
    try{ if (/[.*+?^${}()|[\]\\]/.test(key)){ const re=new RegExp(key,'i'); if (re.test(plaidPath)||re.test(merchant)) return norm(CONFIG.categoryMappings[key]); } }catch{}
  }
  return 'Uncategorized';
}

async function fetchMonthTransactions(uid, ym){
  const cacheKey = `${uid}:${ym}:v3`;
  if (TX_CACHE[cacheKey]) return TX_CACHE[cacheKey];

  const { start, end } = monthRange(ym);
  const itemIds = await listItemIds(uid);
  const txAll = [];

  for (const itemId of itemIds){
    const txRef = collection(db,'users',uid,'plaid_items',itemId,'transactions');
    const snap = await getDocs(query(txRef, orderBy('date','desc'), limit(2000)));
    snap.forEach(s=>{
      const d = s.data()||{};
      const dtStr = d.date || d.authorized_date || d.posted_at || d.timestamp;
      const dt = new Date(dtStr||0);
      if (!(dt instanceof Date) || Number.isNaN(dt.getTime())) return;
      if (dt < start || dt > end) return;

      const amt = typeof d.amount==='number'? d.amount : Number(d.amount)||0;
      const pending = !!d.pending;
      const plaidType = d.transaction_type || d.payment_channel || '';
      const merchant = d.merchant_name || d.name || 'Transaction';
      const category = d.category || d.personal_finance_category?.primary;

      txAll.push({
        id:s.id, date:dtStr, amount:amt, pending,
        transactionType:plaidType, name:d.name, merchant,
        category, categoryUser:d.categoryUser||'',
        accountId:d.account_id||'', itemId
      });
    });
  }

  const filtered = txAll.filter(t=>{
    if (CONFIG.excludePending && t.pending) return false;
    if (isExcludedByType(t.name, t.transactionType, t.amount)) return false;
    if (categoryIsIgnored(t)) return false;
    return true;
  });

  const resolved = filtered.map(t=>({ ...t, budgetCategory: resolveBudgetCategory(t) }));

  const spentMap = {};
  for (const t of resolved){
    const out = t.amount > 0 ? t.amount : 0;
    spentMap[t.budgetCategory] = (spentMap[t.budgetCategory]||0)+out;
  }

  const meta = { itemCount:itemIds.length, txRaw:txAll.length, txUsed:resolved.length };
  TX_CACHE[cacheKey] = { tx: resolved, spentMap, meta };
  return TX_CACHE[cacheKey];
}

/* --------------------------- Computations ----------------------------- */
function computeTotals(categories, spentMap){
  const budgeted = categories.reduce((s,c)=>s+num(c.amount),0);
  const spent = categories.reduce((s,c)=>s+(spentMap[c.name]||0),0);
  const remaining = budgeted - spent;
  return { budgeted, spent, remaining };
}

/* ------------------------------ UI Bits ------------------------------- */
function injectAdvancedControls(){
  const actionsWrap = document.querySelector('header .flex.items-center.gap-2')?.parentElement;
  if (!actionsWrap) return;
  if (document.getElementById('btn-sync-now')) return; // already injected

  const bar = document.createElement('div');
  bar.className='mt-3 flex flex-wrap items-center gap-2';
  bar.innerHTML = `
    <button id="btn-sync-now" class="px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-900 text-sm">Sync Now</button>
    <div class="hidden md:block h-6 w-px bg-neutral-800"></div>
    <div class="flex items-center gap-2">
      <label for="filter-cat" class="text-sm text-neutral-400">Filter</label>
      <select id="filter-cat" class="chip px-3 py-2 rounded-xl bg-transparent text-sm">
        <option value="all">All categories</option>
        <option value="over">Over budget</option>
        <option value="under">Under budget</option>
        <option value="uncat">Uncategorized</option>
      </select>
    </div>
    <button id="btn-edit-rules" class="px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-900 text-sm">Rules</button>
    <span id="last-synced" class="ml-auto text-xs text-neutral-500">Last synced —</span>
  `;
  actionsWrap.appendChild(bar);

  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);
  document.getElementById('filter-cat')?.addEventListener('change', (e)=>{
    CONFIG.lastUI = { ...(CONFIG.lastUI||{}), tag:e.target.value };
    saveConfigPartial(UID, { lastUI: CONFIG.lastUI });
    renderList();
  });
  document.getElementById('btn-edit-rules')?.addEventListener('click', openRulesModal);

  // Minimal modal shell (if not present)
  if (!document.getElementById('rules-modal')){
    const modal=document.createElement('div');
    modal.id='rules-modal';
    modal.className='fixed inset-0 z-[60] hidden';
    modal.innerHTML=`
      <div class="absolute inset-0 bg-black/70 backdrop-blur"></div>
      <div class="relative mx-auto max-w-2xl mt-24 glass p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Budget Rules</h3>
          <button id="rules-close" class="px-3 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-900 text-sm">Close</button>
        </div>
        <div class="mt-4">
          <h4 class="font-medium">Merchant Rules</h4>
          <p class="text-sm text-neutral-400">If the merchant matches this regex, assign the target budget category.</p>
          <div id="rules-merchant-list" class="mt-2 space-y-2"></div>
          <button id="add-merchant-rule" class="mt-2 btn-neon px-3 py-2 rounded-xl text-sm">Add Rule</button>
        </div>
        <div class="mt-6">
          <h4 class="font-medium">Category Mappings</h4>
          <p class="text-sm text-neutral-400">Map Plaid categories or regex patterns to your budget categories.</p>
          <div id="rules-cat-list" class="mt-2 space-y-2"></div>
          <button id="add-cat-map" class="mt-2 btn-neon px-3 py-2 rounded-xl text-sm">Add Mapping</button>
        </div>
        <div class="mt-6">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" id="opt-excl-transfers" class="accent-[var(--neon)]"/>
            Exclude transfers & payments
          </label>
          <label class="flex items-center gap-2 text-sm mt-1">
            <input type="checkbox" id="opt-excl-pending" class="accent-[var(--neon)]"/>
            Exclude pending transactions
          </label>
          <label class="flex items-center gap-2 text-sm mt-1">
            <input type="checkbox" id="opt-include-refunds" class="accent-[var(--neon)]"/>
            Include refunds as negative spend
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button id="rules-save" class="btn-neon px-4 py-2 rounded-xl text-sm">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
}

/* ------------------------------ Rendering ------------------------------ */
function renderList(){
  if (!els.list) return;
  const filter = CONFIG.lastUI?.tag || 'all';
  els.list.innerHTML='';

  const display = [...CATEGORIES].sort((a,b)=>{
    const ra = num(a.amount) - (SPENT[a.name]||0);
    const rb = num(b.amount) - (SPENT[b.name]||0);
    return ra - rb;
  });

  const match = (c)=>{
    const spent = SPENT[c.name]||0;
    const rem = num(c.amount) - spent;
    if (filter==='over') return rem<0;
    if (filter==='under') return rem>=0 && num(c.amount)>0;
    if (filter==='uncat') return c.name.toLowerCase()==='uncategorized';
    return true;
  };

  const rows = display.filter(match);
  if (!rows.length){
    els.list.innerHTML = `<div class="text-neutral-400 text-sm">No categories to show for this filter.</div>`;
    renderTotals(); return;
  }

  for (const c of rows){
    const spent = SPENT[c.name]||0;
    const remaining = num(c.amount) - spent;
    const pct = num(c.amount)>0 ? Math.min(100, Math.max(0, Math.round((spent/num(c.amount))*100))) : 0;

    const frag = els.template.content.cloneNode(true);
    frag.querySelector('.cat-name').textContent = c.name;
    frag.querySelector('.cat-budget').textContent = money(c.amount);
    frag.querySelector('.cat-spent').textContent = money(spent);
    frag.querySelector('.cat-remaining').textContent = money(remaining);
    frag.querySelector('.cat-progress').style.width = `${pct}%`;

    if (remaining < 0) frag.querySelector('.cat-remaining').style.color = '#fda4af';

    frag.querySelector('.edit-btn').addEventListener('click', async ()=>{
      const newName = prompt('Category name:', c.name);
      if (!newName) return;
      const amtStr = prompt('Budget amount:', `${c.amount}`);
      const newAmt = amtStr===null ? c.amount : Number(amtStr);
      await updateCategory(UID, CURRENT_MONTH, c.id, { name: norm(newName), amount: num(newAmt) });
      c.name = norm(newName); c.amount = num(newAmt);
      toast('Saved');
      await recomputeFromCache();
      renderList();
    });

    frag.querySelector('.delete-btn').addEventListener('click', async ()=>{
      if (!confirm('Delete this category?')) return;
      await removeCategory(UID, CURRENT_MONTH, c.id);
      CATEGORIES = CATEGORIES.filter(x=>x.id!==c.id);
      toast('Deleted'); renderTotals(); renderList();
    });

    els.list.appendChild(frag);
  }

  renderTotals();
}
function renderTotals(){
  TOTALS = computeTotals(CATEGORIES, SPENT);
  els.totalBudgeted.textContent = money(TOTALS.budgeted);
  els.totalSpent.textContent    = money(TOTALS.spent);
  els.totalRemaining.textContent= money(TOTALS.remaining);
  const pct = TOTALS.budgeted>0 ? Math.min(100, Math.round((TOTALS.spent/TOTALS.budgeted)*100)) : 0;
  els.totalProgress.style.width = `${pct}%`;
}

/* ------------------------------ CSV Export ----------------------------- */
function buildCsv(){
  const lines = [['Month','Category','Budgeted','Spent','Remaining']];
  for (const c of CATEGORIES){
    const spent = SPENT[c.name]||0;
    const remaining = num(c.amount)-spent;
    lines.push([CURRENT_MONTH,c.name,num(c.amount),spent,remaining]);
  }
  lines.push(['','TOTAL',TOTALS.budgeted,TOTALS.spent,TOTALS.remaining]);
  return lines.map(r=>r.join(',')).join('\n');
}
function download(name,text){
  const blob=new Blob([text],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
}

/* ------------------------------ Rules Modal ---------------------------- */
function openRulesModal(){
  const modal=document.getElementById('rules-modal'); if (!modal) return;
  const mList=modal.querySelector('#rules-merchant-list'); const cList=modal.querySelector('#rules-cat-list');

  // Merchant rules
  mList.innerHTML='';
  (CONFIG.merchantRules||[]).forEach((r,i)=>{
    const row=document.createElement('div');
    row.className='flex items-center gap-2';
    row.innerHTML=`
      <input data-i="${i}" data-k="pattern" class="chip px-3 py-2 rounded-xl bg-transparent text-sm flex-1" value="${r.pattern||''}" placeholder="Regex (e.g., (?i)trader joe)"/>
      <input data-i="${i}" data-k="budgetCategory" class="chip px-3 py-2 rounded-xl bg-transparent text-sm" value="${r.budgetCategory||''}" placeholder="Budget category"/>
      <button data-i="${i}" class="btn-del px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-900 text-sm">Delete</button>`;
    mList.appendChild(row);
  });

  // Category mappings
  cList.innerHTML='';
  Object.entries(CONFIG.categoryMappings||{}).forEach(([k,v])=>{
    const row=document.createElement('div');
    row.className='flex items-center gap-2';
    row.innerHTML=`
      <input data-k="${encodeURIComponent(k)}" class="chip px-3 py-2 rounded-xl bg-transparent text-sm flex-1" value="${k}" placeholder="Plaid category or regex"/>
      <input data-v="${encodeURIComponent(k)}" class="chip px-3 py-2 rounded-xl bg-transparent text-sm" value="${v}" placeholder="Budget category"/>
      <button data-k="${encodeURIComponent(k)}" class="btn-del-map px-3 py-2 rounded-xl border border-neutral-800 hover:bg-neutral-900 text-sm">Delete</button>`;
    cList.appendChild(row);
  });

  modal.querySelector('#opt-excl-transfers').checked = !!CONFIG.excludeTransfers;
  modal.querySelector('#opt-excl-pending').checked   = !!CONFIG.excludePending;
  modal.querySelector('#opt-include-refunds').checked= !!CONFIG.includeRefunds;

  modal.querySelector('#add-merchant-rule').onclick = ()=>{ CONFIG.merchantRules=[...(CONFIG.merchantRules||[]), {pattern:'',budgetCategory:''}]; openRulesModal(); };
  modal.querySelectorAll('#rules-merchant-list .btn-del').forEach(btn=>{
    btn.onclick=()=>{ const idx=Number(btn.getAttribute('data-i')); CONFIG.merchantRules.splice(idx,1); openRulesModal(); };
  });
  modal.querySelector('#add-cat-map').onclick = ()=>{ CONFIG.categoryMappings={...CONFIG.categoryMappings, 'Restaurants':'Dining'}; openRulesModal(); };

  modal.querySelector('#rules-save').onclick = async ()=>{
    // collect rules
    const newRules = [];
    modal.querySelectorAll('#rules-merchant-list input').forEach(inp=>{
      const i=Number(inp.dataset.i), key=inp.dataset.k;
      newRules[i]=newRules[i]||{pattern:'',budgetCategory:''};
      newRules[i][key]=inp.value;
    });
    const map = {};
    modal.querySelectorAll('#rules-cat-list input[data-k]').forEach(inp=>{
      const k=decodeURIComponent(inp.dataset.k);
      const valEl = modal.querySelector(`input[data-v="${encodeURIComponent(k)}"]`);
      map[k] = valEl?.value || '';
    });
    CONFIG.merchantRules=(newRules||[]).filter(r=>r.pattern && r.budgetCategory);
    CONFIG.categoryMappings=map;
    CONFIG.excludeTransfers = modal.querySelector('#opt-excl-transfers').checked;
    CONFIG.excludePending   = modal.querySelector('#opt-excl-pending').checked;
    CONFIG.includeRefunds   = modal.querySelector('#opt-include-refunds').checked;
    await saveConfigPartial(UID, {
      merchantRules: CONFIG.merchantRules,
      categoryMappings: CONFIG.categoryMappings,
      excludeTransfers: CONFIG.excludeTransfers,
      excludePending: CONFIG.excludePending,
      includeRefunds: CONFIG.includeRefunds,
    });
    await refreshAll(true);
    closeRulesModal(); toast('Rules saved');
  };
  modal.querySelector('#rules-close').onclick = closeRulesModal;

  modal.classList.remove('hidden');
}
function closeRulesModal(){ document.getElementById('rules-modal')?.classList.add('hidden'); }

/* ----------------------- Netlify Sync Integration ---------------------- */
async function handleSyncNow(){
  try{
    if (!auth.currentUser) { toast('Please sign in'); return; }
    const idToken = await auth.currentUser.getIdToken(/* forceRefresh */ true);

    // Use current select value if present
    const month = (els.month && els.month.value) ? els.month.value : CURRENT_MONTH;

    // Call Netlify function
    const res = await fetch('/.netlify/functions/plaid-sync', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${idToken}` },
      body: JSON.stringify({ month })
    });

    if (!res.ok){
      const t = await res.text();
      console.error('plaid-sync error', res.status, t);
      toast('Sync failed');
      return;
    }
    const data = await res.json();
    // Bust cache and recompute
    TX_CACHE = {};
    await refreshAll(true);

    const msg = `Synced ${data.itemsProcessed||0} item(s), wrote ${data.txWritten||0} tx`;
    toast(msg);
  } catch (e) {
    console.error('[SyncNow]', e);
    toast('Sync error');
  }
}

/* -------------------------- Flow & Wiring ------------------------------ */
async function recomputeFromCache(){
  const { spentMap } = await fetchMonthTransactions(UID, CURRENT_MONTH);
  SPENT = spentMap; renderTotals();
}
async function refreshAll(force=false){
  await ensureMonthDoc(UID, CURRENT_MONTH);
  CATEGORIES = await loadCategories(UID, CURRENT_MONTH);
  if (force) TX_CACHE = {};
  const { spentMap } = await fetchMonthTransactions(UID, CURRENT_MONTH);
  SPENT = spentMap; renderList();
}
function populateMonthSelect(){
  if (!els.month) return;
  const now=new Date(); const options=[];
  for (let o=-12;o<=6;o++){
    const d=new Date(now.getFullYear(), now.getMonth()+o, 1);
    const ym=yyyyMm(d);
    options.push(`<option value="${ym}" ${ym===CURRENT_MONTH?'selected':''}>${ym}</option>`);
  }
  els.month.innerHTML=options.join('');
}
function wire(){
  els.addBtn?.addEventListener('click', async ()=>{
    const name=(els.addName?.value||'').trim();
    const amt=num(els.addAmount?.value);
    if (!name){ toast('Enter a name'); return; }
    const id=await createCategory(UID, CURRENT_MONTH, name, amt);
    CATEGORIES.push({id,name:norm(name),amount:amt});
    els.addName.value=''; els.addAmount.value='';
    toast('Added'); await recomputeFromCache(); renderList();
  });
  els.month?.addEventListener('change', async ()=>{
    CURRENT_MONTH = els.month.value;
    await refreshAll(true);
  });
  els.exportCsv?.addEventListener('click', ()=>{
    download(`budget_${CURRENT_MONTH}.csv`, buildCsv());
  });

  // Wire after injection
  document.getElementById('btn-sync-now')?.addEventListener('click', handleSyncNow);
  document.getElementById('btn-edit-rules')?.addEventListener('click', openRulesModal);
}

/* -------------------------------- Init -------------------------------- */
function init(){
  onAuthStateChanged(auth, async (user)=>{
    if (!user) return;
    UID = user.uid;
    await loadConfig(UID);
    populateMonthSelect();
    wire();
    await refreshAll(true);
  });
}
document.addEventListener('DOMContentLoaded', init);

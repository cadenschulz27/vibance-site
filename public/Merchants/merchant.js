// public/Merchants/merchant.js
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const titleEl = document.getElementById('merchant-title');
const subEl = document.getElementById('merchant-sub');
const bodyEl = document.getElementById('tx-body');
const sumExpEl = document.getElementById('sum-exp');
const sumIncEl = document.getElementById('sum-inc');
const sumCountEl = document.getElementById('sum-count');
const catBarsEl = document.getElementById('cat-bars');
const monthBarsEl = document.getElementById('month-bars');

function q(name){ try { return new URL(location.href).searchParams.get(name); } catch { return null; } }
function fmt(n){ try { return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(n);} catch { return '$'+(n||0).toFixed(2);} }
function fmtDate(s){ var d=new Date(s); return isNaN(d.getTime())? s: d.toLocaleDateString(); }

async function listItems(uid){
  const snap = await getDocs(query(collection(db,'users',uid,'plaid_items'), orderBy('institution_name')));
  return snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
}
async function fetchTx(uid,itemId){
  const snap = await getDocs(query(collection(db,'users',uid,'plaid_items',itemId,'transactions'), orderBy('date','desc'), limit(800)));
  return snap.docs.map(d=>({ id:d.id, ...(d.data()||{}), itemId }));
}

async function boot(uid, merchant){
  if (titleEl) titleEl.textContent = merchant;
  const items = await listItems(uid);
  let all = [];
  for (const it of items){
    const rows = await fetchTx(uid, it.id);
    rows.forEach(r => r.institution_name = it.institution_name);
    all = all.concat(rows);
  }
  const m = String(merchant||'').toLowerCase();
  const match = all.filter(x => String(x.merchant_name||'').toLowerCase() === m || String(x.name||'').toLowerCase().indexOf(m) >= 0);
  let exp=0, inc=0;
  const catAgg = {}; // name -> total spent
  const monAgg = {}; // yyyy-mm -> total spent
  if (bodyEl) bodyEl.innerHTML='';
  match.forEach(x => {
    const amt = Number(x.amount||0);
    if (amt < 0) inc += Math.abs(amt); else {
      exp += amt;
      const cat = (x.categoryUser || (x.personal_finance_category && x.personal_finance_category.primary) || 'Uncategorized');
      catAgg[cat] = (catAgg[cat] || 0) + amt;
      const ym = (new Date(x.date)).toISOString().slice(0,7);
      monAgg[ym] = (monAgg[ym] || 0) + amt;
    }
    const tr = document.createElement('tr');
    const cls = amt<0 ? 'text-emerald-400' : 'text-red-400';
    tr.innerHTML = '<td class="px-4 py-3">'+fmtDate(x.date)+'</td>'+
                   '<td class="px-4 py-3">'+(x.name||'')+'</td>'+
                   '<td class="px-4 py-3 text-right '+cls+'">'+fmt(Math.abs(amt))+'</td>'+
                   '<td class="px-4 py-3">'+(x.institution_name||'')+'</td>';
    bodyEl.appendChild(tr);
  });
  if (sumExpEl) sumExpEl.textContent = fmt(exp);
  if (sumIncEl) sumIncEl.textContent = fmt(inc);
  if (sumCountEl) sumCountEl.textContent = String(match.length);
  if (subEl) subEl.textContent = match.length ? 'Based on your linked accounts' : 'No matching transactions found';

  // Render category bars (top 6 by spend)
  if (catBarsEl) {
    catBarsEl.innerHTML = '';
    const entries = Object.entries(catAgg).sort((a,b)=>b[1]-a[1]).slice(0,6);
    const max = Math.max(1, ...entries.map(e=>e[1]));
    entries.forEach(([name,total]) => {
      const row = document.createElement('div');
      row.innerHTML = `<div class="flex items-center justify-between text-sm"><span>${name}</span><span>${fmt(total)}</span></div>
        <div class="h-2 bg-neutral-900 border border-neutral-800 rounded"><div class="h-2 bg-red-500/70 rounded" style="width:${Math.round(total/max*100)}%"></div></div>`;
      catBarsEl.appendChild(row);
    });
  }

  // Render month bars (last 6 months)
  if (monthBarsEl) {
    monthBarsEl.innerHTML = '';
    const labels = Object.keys(monAgg).sort().slice(-6);
    const max = Math.max(1, ...labels.map(k=>monAgg[k]));
    labels.forEach(ym => {
      const d = new Date(ym+'-01T00:00:00');
      const lab = d.toLocaleDateString(undefined,{ month:'short', year:'2-digit' });
      const total = monAgg[ym];
      const row = document.createElement('div');
      row.innerHTML = `<div class="flex items-center justify-between text-sm"><span>${lab}</span><span>${fmt(total)}</span></div>
        <div class="h-2 bg-neutral-900 border border-neutral-800 rounded"><div class="h-2 bg-red-500/70 rounded" style="width:${Math.round(total/max*100)}%"></div></div>`;
      monthBarsEl.appendChild(row);
    });
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const name = q('name') || '';
  if (!name) { if (subEl) subEl.textContent = 'Missing merchant name'; return; }
  boot(user.uid, name).catch(e => { console.error(e); if (subEl) subEl.textContent = 'Failed to load'; });
});

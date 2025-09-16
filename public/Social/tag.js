// public/Social/tag.js
import { db } from '../api/firebase.js';
import { collection, getDocs, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const nameEl = document.getElementById('tag-name');
const countEl = document.getElementById('tag-count');
const listEl = document.getElementById('tag-list');
const emptyEl = document.getElementById('tag-empty');
const tpl = document.getElementById('post-card-template');

function qparam(name){ try { return new URL(location.href).searchParams.get(name); } catch (e) { return null; } }
function fmtTime(ts){
  const d = ts && typeof ts.toDate === 'function' ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts || 0));
  if (isNaN(d.getTime())) return 'Just now';
  const diff = (Date.now() - d.getTime())/1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  return d.toLocaleDateString();
}
function toModel(id, d){
  d = d || {};
  return { id:id, userId:d.userId, displayName:d.displayName||'Member', photoURL:d.photoURL||'/images/logo_white.png', description:d.description||'', createdAt:d.createdAt||null, imageURL:d.imageURL||null, tags:Array.isArray(d.tags)?d.tags:[] };
}
function renderCard(p){
  const frag = tpl.content.cloneNode(true);
  const root = frag.querySelector('article');
  const av = root.querySelector('.post-avatar'); if (av) av.src = p.photoURL;
  const a = root.querySelector('.post-author');
  if (a) { a.textContent = p.displayName || 'Member'; a.href = './user-profile.html?uid=' + encodeURIComponent(p.userId); }
  const meta = root.querySelector('.post-meta'); if (meta) meta.textContent = fmtTime(p.createdAt);
  const body = root.querySelector('.post-body'); if (body) body.textContent = p.description || '';
  if (p.imageURL) { const wrap = root.querySelector('.post-image-wrap'); if (wrap) { wrap.classList.remove('hidden'); const img = wrap.querySelector('.post-image'); if (img) img.src = p.imageURL; } }
  return root;
}
async function loadTag(name){
  if (nameEl) nameEl.textContent = name;
  const snap = await getDocs(query(collection(db,'posts'), where('tags','array-contains', name), orderBy('createdAt','desc'), limit(50)));
  const items = snap.docs.map(function(d){ return toModel(d.id, d.data()||{}); });
  if (countEl) countEl.textContent = String(items.length);
  if (listEl) listEl.innerHTML = '';
  if (!items.length) { if (emptyEl) emptyEl.classList.remove('hidden'); return; }
  items.forEach(function(p){ listEl.appendChild(renderCard(p)); });
}
document.addEventListener('DOMContentLoaded', function(){
  var name = (qparam('name')||'').toLowerCase();
  if (!name) return;
  loadTag(name).catch(console.error);
});


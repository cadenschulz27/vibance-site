// /public/presence.js
import { auth, db } from '/api/firebase.js';
import {
  getDatabase, ref, onDisconnect, onValue, serverTimestamp as rtdbServerTimestamp, set, update,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {
  doc, setDoc, serverTimestamp as fsServerTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

let rtdb;
let connUnsub = null;
let beatHandlersBound = false;
let currentUid = null;
const HEARTBEAT_MS = 20000; // 20s — admin will mark Offline if lastSeenAt is stale (>60s)

function throttle(fn, waitMs) {
  let last = 0, pending;
  return (...args) => {
    const now = Date.now();
    const run = () => { last = now; pending = undefined; fn(...args); };
    if (now - last >= waitMs) return run();
    if (!pending) pending = setTimeout(run, waitMs - (now - last));
  };
}

async function ensureIndexSelf() {
  try {
    const u = auth.currentUser; if (!u) return;
    const t = await u.getIdToken(true);
    await fetch('/.netlify/functions/user-index-self', { method: 'POST', headers: { Authorization: `Bearer ${t}` } });
  } catch (e) { console.warn('[presence] index self skipped:', e?.message || e); }
}

async function mirrorPresenceToFirestore(uid, online) {
  try {
    await setDoc(doc(db, 'users_index', uid), {
      presence: { online: !!online }, lastSeenAt: fsServerTimestamp(),
    }, { merge: true });
  } catch (e) { console.warn('[presence] Firestore mirror failed:', e?.message || e); }
}

async function setupPresence(u) {
  if (!u) return;
  currentUid = u.uid;

  try { if (!rtdb) rtdb = getDatabase(); } catch (e) {
    console.warn('[presence] RTDB not available:', e?.message || e);
    await mirrorPresenceToFirestore(currentUid, true);
    return;
  }

  const myRef = ref(rtdb, `presence/${currentUid}`);
  const connRef = ref(rtdb, '.info/connected');

  if (connUnsub) { try { connUnsub(); } catch {} connUnsub = null; }

  connUnsub = onValue(connRef, async (snap) => {
    const connected = !!snap.val();
    if (!connected) return;

    try { await onDisconnect(myRef).set({ state: 'offline', last_changed: rtdbServerTimestamp() }); } catch {}
    try { await set(myRef, { state: 'online', last_changed: rtdbServerTimestamp() }); } catch {}
    await mirrorPresenceToFirestore(currentUid, true); // bump lastSeenAt immediately
  });

  const beat = throttle(async () => {
    try { await update(myRef, { last_changed: rtdbServerTimestamp() }); } catch {}
    await mirrorPresenceToFirestore(currentUid, true); // bump lastSeenAt
  }, 5000);

  // periodic heartbeat while tab is open
  setInterval(() => { beat(); }, HEARTBEAT_MS);

  if (!beatHandlersBound) {
    beatHandlersBound = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
    window.addEventListener('focus', beat);
    window.addEventListener('beforeunload', () => { try {
      navigator.sendBeacon?.('/.netlify/functions/user-index-self', new Blob([], { type: 'application/json' }));
    } catch {} });
  }
}

onAuthStateChanged(auth, async (u) => {
  if (!u) {
    currentUid = null;
    if (connUnsub) { try { connUnsub(); } catch {} connUnsub = null; }
    return;
  }
  try { await u.reload(); } catch {}
  await ensureIndexSelf();
  await setupPresence(u);
});

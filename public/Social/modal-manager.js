// public/Social/modal-manager.js
// ---------------------------------------------------------------------------
// Vibance • Modal Manager
// - Declarative triggers: 
//     * [data-modal-open="#selector"] on any element to open a modal
//     * [data-modal-close] inside a modal to close it
// - JS API:
//     * openModal(target, { onOpen, onClose, trapFocus })
//     * closeModal(target)
//     * registerModal(modalEl)  // initialize a modal dynamically added to DOM
// - A11y:
//     * ARIA roles/attributes set automatically if missing
//     * Focus trap inside modal; ESC & backdrop click to close
//     * Returns focus to trigger that opened it
// - Idempotent wiring; safe to import multiple times
// ---------------------------------------------------------------------------

(() => {
  if (window.__VB_MODAL_WIRED__) return;
  window.__VB_MODAL_WIRED__ = true;

  // ------------------------------ Utilities ------------------------------
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isHidden = (el) => el.classList.contains('hidden') || el.getAttribute('aria-hidden') === 'true';
  const addClass = (el, c) => el && el.classList.add(c);
  const rmClass = (el, c) => el && el.classList.remove(c);
  const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
  const off = (el, ev, fn, opts) => el && el.removeEventListener(ev, fn, opts);

  // Simple focusable selector
  const FOCUSABLE = [
    'a[href]', 'area[href]', 'button:not([disabled])', 'input:not([disabled])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]'
  ].join(',');

  // Scroll lock handling
  let lockCount = 0;
  const lockScroll = () => {
    lockCount++;
    if (lockCount === 1) {
      const sbw = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.overflow = 'hidden';
      // Prevent layout shift when scrollbar disappears
      if (sbw > 0) document.documentElement.style.paddingRight = `${sbw}px`;
    }
  };
  const unlockScroll = () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.documentElement.style.overflow = '';
      document.documentElement.style.paddingRight = '';
    }
  };

  // Track opener -> modal mapping (for returning focus)
  const openerMap = new WeakMap();

  // ------------------------------ ARIA setup ------------------------------
  function ensureAria(modal) {
    if (!modal) return;
    modal.setAttribute('role', modal.getAttribute('role') || 'dialog');
    modal.setAttribute('aria-modal', modal.getAttribute('aria-modal') || 'true');
    modal.setAttribute('aria-hidden', modal.getAttribute('aria-hidden') || 'true');
    // Ensure there's a label
    const hasLabel = modal.getAttribute('aria-label') || modal.getAttribute('aria-labelledby');
    if (!hasLabel) {
      const title = modal.querySelector('[data-modal-title], h1, h2, h3');
      if (title && !title.id) title.id = `vb-modal-title-${Math.random().toString(36).slice(2, 9)}`;
      if (title) modal.setAttribute('aria-labelledby', title.id);
    }
    // Backdrop: allow clicking outside content to close
    modal.classList.add('vb-modal'); // hook for styling if needed
  }

  // ------------------------------ Focus trap ------------------------------
  function trapFocus(modal) {
    const focusables = qsa(FOCUSABLE, modal).filter(el => el.offsetParent !== null || el === document.activeElement);
    const first = focusables[0] || modal;
    const last = focusables[focusables.length - 1] || modal;

    function onKey(e) {
      if (e.key !== 'Tab') return;
      if (focusables.length === 0) { e.preventDefault(); modal.focus(); return; }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    on(modal, 'keydown', onKey);
    return () => off(modal, 'keydown', onKey);
  }

  // ------------------------------ Open/Close ------------------------------
  function openModal(target, opts = {}) {
    const modal = typeof target === 'string' ? document.querySelector(target) : target;
    if (!modal) return;

    ensureAria(modal);
    if (!isHidden(modal)) return; // already open

    // Store opener to return focus later
    if (document.activeElement instanceof HTMLElement) {
      openerMap.set(modal, document.activeElement);
    }

    // Show modal
    rmClass(modal, 'hidden');
    modal.setAttribute('aria-hidden', 'false');
    lockScroll();

    // Click outside to close: assume modal has an inner content wrapper
    const content = modal.querySelector('[data-modal-content]') || modal.firstElementChild || modal;
    function outsideClick(e) {
      if (!content.contains(e.target)) { closeModal(modal); }
    }
    on(modal, 'mousedown', outsideClick);

    // ESC to close
    function onEsc(e) {
      if (e.key === 'Escape') closeModal(modal);
    }
    on(document, 'keydown', onEsc);

    // Focus handling
    const releaseTrap = opts.trapFocus === false ? () => {} : trapFocus(modal);
    setTimeout(() => {
      // Focus first focusable or modal itself
      const focusables = qsa(FOCUSABLE, modal);
      (focusables[0] || modal).focus?.();
    }, 0);

    // Wire [data-modal-close]
    const closeBtns = qsa('[data-modal-close]', modal);
    const onBtn = () => closeModal(modal);
    closeBtns.forEach(btn => on(btn, 'click', onBtn));

    // Keep references to cleanup
    modal.__vb_cleanup__ = () => {
      off(modal, 'mousedown', outsideClick);
      off(document, 'keydown', onEsc);
      closeBtns.forEach(btn => off(btn, 'click', onBtn));
      releaseTrap();
    };

    // Callback
    opts.onOpen?.(modal);
  }

  function closeModal(target, opts = {}) {
    const modal = typeof target === 'string' ? document.querySelector(target) : target;
    if (!modal) return;

    if (isHidden(modal)) return; // already closed

    // Cleanup listeners & focus trap
    try { modal.__vb_cleanup__?.(); } catch {}
    modal.__vb_cleanup__ = null;

    // Hide + unlock scroll
    addClass(modal, 'hidden');
    modal.setAttribute('aria-hidden', 'true');
    unlockScroll();

    // Return focus to last opener
    const opener = openerMap.get(modal);
    if (opener && opener.focus) {
      setTimeout(() => opener.focus(), 0);
    }

    // Callback
    opts.onClose?.(modal);
  }

  function registerModal(el) {
    ensureAria(el);
    if (isHidden(el)) el.setAttribute('aria-hidden', 'true');
    else el.setAttribute('aria-hidden', 'false');
  }

  // ------------------------------ Declarative wiring ------------------------------
  // Any element with [data-modal-open="#selector"] opens the referenced modal
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const opener = t.closest('[data-modal-open]');
    if (!opener) return;

    const target = opener.getAttribute('data-modal-open');
    if (!target) return;
    e.preventDefault();
    openModal(target);
  }, true);

  // Auto-register any modal present at load (optional but nice)
  qsa('.modal, .vb-modal, [role="dialog"][aria-modal="true"]').forEach(registerModal);

  // ------------------------------ Export API ------------------------------
  const api = Object.freeze({ openModal, closeModal, registerModal });

  // ESM export (if supported by bundler) + global
  try { window.VBModal = api; } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.VB = Object.freeze({ ...(window.VB || {}), ...api });
  }
})();

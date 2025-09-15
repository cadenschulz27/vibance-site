// public/Social/listeners.js
// ------------------------------------------------------------
// Vibance • Global UI listeners for Community
// - Post action popovers: open/close via delegation
// - Close popovers on outside click or Escape
// - Quick share: Alt/Option-click on ".post-permalink" copies URL
// - Idempotent: safe to import multiple times
// ------------------------------------------------------------

import { toast, openPopover } from './ui-helpers.js';

if (!window.__VB_LISTENERS_WIRED__) {
  window.__VB_LISTENERS_WIRED__ = true;

  // Track the currently open popover close fn (from openPopover)
  let closeCurrentPopover = null;

  function isInside(el, root) {
    try { return !!(el && (el === root || root.contains(el))); }
    catch { return false; }
  }

  // Delegated clicks
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);

    // --- Handle post menu toggles ----------------------------------------
    // Any element with class ".post-menu" should toggle its sibling popover.
    const menuBtn = target.closest?.('.post-menu');
    if (menuBtn) {
      e.preventDefault();
      const card = menuBtn.closest('article');
      const popover = card?.querySelector('.post-menu-popover');
      if (!popover) return;

      // If already open, close it; else open and register global close.
      const isOpen = !popover.classList.contains('hidden');
      // Close any currently open popover first
      document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
      if (closeCurrentPopover) { try { closeCurrentPopover(); } catch {} finally { closeCurrentPopover = null; } }

      if (!isOpen) {
        closeCurrentPopover = openPopover(menuBtn, popover);
      }
      return;
    }

    // --- Quick share: Alt/Option-click permalink to copy -----------------
    // Normal click navigates; Alt-click copies to clipboard.
    const permalink = target.closest?.('.post-permalink');
    if (permalink && (e.altKey || e.metaKey)) {
      e.preventDefault();
      const href = permalink.getAttribute('href') || location.href;
      try {
        navigator.clipboard?.writeText?.(new URL(href, location.href).href);
        toast('Link copied');
      } catch {
        // Fallback: create temp input
        const input = document.createElement('input');
        input.value = new URL(href, location.href).href;
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy'); toast('Link copied'); } catch {}
        input.remove();
      }
      return;
    }

    // --- Close any open popover when clicking outside --------------------
    const anyOpen = document.querySelector('.post-menu-popover:not(.hidden)');
    if (anyOpen && !isInside(target, anyOpen) && !target.closest('.post-menu')) {
      anyOpen.classList.add('hidden');
      if (closeCurrentPopover) { try { closeCurrentPopover(); } catch {} finally { closeCurrentPopover = null; } }
    }
  }, true);

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const anyOpen = document.querySelector('.post-menu-popover:not(.hidden)');
    if (anyOpen) {
      anyOpen.classList.add('hidden');
      if (closeCurrentPopover) { try { closeCurrentPopover(); } catch {} finally { closeCurrentPopover = null; } }
    }
  });

  // Mutation observer: if cards are injected after load, ensure no stray open menus remain
  const mo = new MutationObserver(() => {
    // If DOM changes while a popover is open and its anchor disappeared, close it.
    const openPop = document.querySelector('.post-menu-popover:not(.hidden)');
    if (openPop) {
      const anchorStillThere = document.querySelector('.post-menu') && openPop.parentElement;
      if (!anchorStillThere) {
        openPop.classList.add('hidden');
        if (closeCurrentPopover) { try { closeCurrentPopover(); } catch {} finally { closeCurrentPopover = null; } }
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Optional: expose a manual close on window for edge cases
  window.VB = Object.freeze({
    ...(window.VB || {}),
    closeAllPopovers: () => {
      document.querySelectorAll('.post-menu-popover').forEach(m => m.classList.add('hidden'));
      if (closeCurrentPopover) { try { closeCurrentPopover(); } catch {} finally { closeCurrentPopover = null; } }
    }
  });
}

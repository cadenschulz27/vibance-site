// public/shared/anim.js
// Unified animation helpers: reduced-motion, scroll-reveal, and route fade

const prefersReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

function setupRouteFade() {
  if (prefersReduced) return;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    try {
      const url = new URL(a.getAttribute('href'), location.href);
      if (url.origin !== location.origin) return;
      if (a.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (url.pathname === location.pathname && url.hash) return;
      e.preventDefault();
      document.body.classList.add('vb-route-leave');
      setTimeout(() => { location.href = url.href; }, 150);
    } catch {}
  }, true);
}

function setupScrollReveal() {
  if (prefersReduced) return;
  const revealables = Array.prototype.slice.call(document.querySelectorAll('.vb-reveal, .vb-anim-card'));
  if (!revealables.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) {
      if (en.isIntersecting) {
        en.target.classList.add('vb-revealed');
        io.unobserve(en.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  revealables.forEach(function(el){ io.observe(el); });
}

function injectRouteFadeCSS() {
  if (document.getElementById('vb-route-style')) return;
  const style = document.createElement('style');
  style.id = 'vb-route-style';
  style.textContent = [
    '.vb-route-leave { opacity: 0; transition: opacity .15s ease; }',
    '.vb-reveal:not(.vb-revealed) { opacity: 0; transform: translateY(8px); }',
    '.vb-reveal.vb-revealed { animation: vb-fade-up .35s ease-out both; }'
  ].join('\n');
  document.head.appendChild(style);
}

document.addEventListener('DOMContentLoaded', function() {
  injectRouteFadeCSS();
  setupRouteFade();
  setupScrollReveal();
});


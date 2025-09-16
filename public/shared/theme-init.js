// public/shared/theme-init.js
// Theme setup and toggle binding (works with injected header)

(function(){
  function applyTheme(theme){
    var root = document.documentElement;
    var dark = theme !== 'light';
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    try { localStorage.setItem('vb_theme', dark ? 'dark' : 'light'); } catch(e){}
    var logo = document.getElementById('brand-logo');
    if (logo) logo.src = dark ? '/images/logo_white.png' : '/images/logo_black.png';
    var sun = document.getElementById('icon-sun');
    var moon = document.getElementById('icon-moon');
    if (sun && moon) { sun.classList.toggle('hidden', !dark); moon.classList.toggle('hidden', dark); }
  }

  function currentTheme(){
    try {
      return localStorage.getItem('vb_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    } catch(e) { return 'dark'; }
  }

  function ensureThemeCSS(){
    if (document.getElementById('vb-theme-link')) return;
    var link = document.createElement('link');
    link.id = 'vb-theme-link';
    link.rel = 'stylesheet';
    link.href = '/shared/theme.css';
    document.head.appendChild(link);
  }

  function bindButton(){
    var btn = document.getElementById('btn-theme');
    if (!btn) return false;
    btn.addEventListener('click', function(){
      var next = (document.documentElement.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
      applyTheme(next);
    });
    return true;
  }

  function waitForHeader(){
    if (bindButton()) return;
    var mo = new MutationObserver(function(){ if (bindButton()) mo.disconnect(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('DOMContentLoaded', function(){
    ensureThemeCSS();
    applyTheme(currentTheme());
    waitForHeader();
  });
})();


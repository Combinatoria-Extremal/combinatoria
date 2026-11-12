// Use the same theme preference as the Extremal Combinatorics portal.
(() => {
  const root = document.documentElement;
  let savedTheme;
  try {
    savedTheme = localStorage.getItem('pref-theme');
  } catch (_) {
    // The system preference still works when browser storage is unavailable.
  }
  root.dataset.theme = savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.header');
    const referrer = document.referrer && new URL(document.referrer);
    // Direct visits use English. Follow the portal language for internal navigation.
    if (referrer && referrer.origin === location.origin &&
        !/^\/(en|3aEBC)(\/|$)/.test(referrer.pathname)) {
      header.lang = 'pt';
      header.querySelector('nav').setAttribute('aria-label', 'Navegação principal');
      const home = header.querySelector('.logo > a');
      home.href = '/';
      home.textContent = 'Combinatória Extremal no Brasil';
      home.title = home.textContent + ' (Alt + H)';
      header.querySelector('#theme-toggle').setAttribute('aria-label', 'Alternar tema');
      const alternate = header.querySelector('.lang-switch a');
      alternate.href = '/en/';
      alternate.lang = alternate.hreflang = 'en';
      alternate.textContent = 'English';
      for (const link of header.querySelectorAll('#menu a')) {
        link.href = link.pathname.slice(3);
        link.textContent = link.dataset.pt;
      }
    }
    document.getElementById('theme-toggle').addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('pref-theme', root.dataset.theme);
      } catch (_) {}
    });
    const updateOffset = () => root.style.setProperty('--portal-header-height', `${header.offsetHeight}px`);
    updateOffset();
    new ResizeObserver(updateOffset).observe(header);
  });
})();

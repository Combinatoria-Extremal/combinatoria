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
    document.getElementById('theme-toggle').addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('pref-theme', root.dataset.theme);
      } catch (_) {}
    });
    const header = document.querySelector('.header');
    const updateOffset = () => root.style.setProperty('--portal-header-height', `${header.offsetHeight}px`);
    updateOffset();
    new ResizeObserver(updateOffset).observe(header);
  });
})();

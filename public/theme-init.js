(() => {
  try {
    var saved = JSON.parse(localStorage.getItem('noruler-v3') || 'null');
    var pref = saved && saved.preferences && saved.preferences.theme;
    var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#1e1e2e' : '#eff1f5');
  } catch {}
})();

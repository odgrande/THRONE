// Applies the saved theme (or the device's preference) before the page paints,
// so dark-mode visitors never see a white flash. A separate file, not an
// inline script, because the Content Security Policy blocks inline scripts.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('throne.theme');
  } catch (e) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.classList.toggle('dark', theme === 'dark');
})();

// Applies the visitor's saved theme before the page paints, so a dark-mode
// choice never flashes white. The site is light by default; dark mode is only
// used when the visitor has switched to it. A separate file, not an inline
// script, because the Content Security Policy blocks inline scripts.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('throne.theme');
  } catch (e) {}
  document.documentElement.classList.toggle('dark', theme === 'dark');
})();

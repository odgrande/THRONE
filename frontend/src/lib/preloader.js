// The full-screen yellow preloader (markup + styles in index.html). It stays
// at least MIN_MS so the logo animation can finish, then fades out. Pages call
// hidePreloader() once their data is on screen; it also gives up after
// MAX_MS so a slow or failed request never hides the page behind it.
const MIN_MS = 1600;
const MAX_MS = 8000;
let hidden = false;

export function hidePreloader() {
  if (hidden) return;
  hidden = true;
  const el = document.getElementById('preloader');
  if (!el) return;
  setTimeout(() => {
    el.classList.add('is-done');
    setTimeout(() => el.remove(), 500);
  }, Math.max(0, MIN_MS - performance.now()));
}

setTimeout(hidePreloader, MAX_MS);

// Detects client-side (SPA) route changes from a content script.
//
// Content scripts can't monkey-patch history.pushState on the page's JS context,
// so we detect route changes by:
// 1. Listening for `popstate` events (back/forward navigation)
// 2. Checking `location` after DOM mutations (catches pushState/replaceState
//    which always mutate the DOM after changing the URL)
//
// Only pathname or search param changes are treated as route changes —
// hash-only changes (anchor links) are ignored.

type RouteChangeHandler = () => void;

const DOM_SETTLE_MS = 500;

/**
 * Observe SPA route changes and call `onRouteChange` immediately when one is
 * detected, then call `onContentReady` after the DOM settles.
 *
 * Returns a cleanup function that removes all listeners.
 */
export function observeRouteChanges(
  onRouteChange: RouteChangeHandler,
  onContentReady: RouteChangeHandler,
): () => void {
  let currentPath = location.pathname + location.search;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  function handleChange() {
    const newPath = location.pathname + location.search;
    if (newPath === currentPath) {
      return;
    }
    currentPath = newPath;

    onRouteChange();

    // Wait for the new page's DOM to settle before re-detecting content.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(onContentReady, DOM_SETTLE_MS);
  }

  // Back/forward navigation
  window.addEventListener("popstate", handleChange);

  // Detect pushState/replaceState by checking the URL after DOM mutations.
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(handleChange, 50);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.removeEventListener("popstate", handleChange);
    observer.disconnect();
    clearTimeout(debounceTimer);
    clearTimeout(settleTimer);
  };
}

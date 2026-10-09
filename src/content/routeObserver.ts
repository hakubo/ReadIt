// Detects client-side (SPA) route changes from a content script.
//
// Content scripts can't monkey-patch history.pushState on the page's JS context,
// so we detect route changes by:
// 1. Listening for `popstate` events (back/forward navigation)
// 2. Preferred: the Navigation API's `currententrychange` event (Chrome 102+),
//    which fires after pushState/replaceState/traversals commit a new URL.
//    Navigation events are DOM events, so the isolated world sees the page's
//    navigations too.
// 3. Fallback: checking `location` after DOM mutations (catches
//    pushState/replaceState, which always mutate the DOM after changing the URL)
//
// Only pathname or search param changes are treated as route changes —
// hash-only changes (anchor links) are ignored, except hash routes
// (`#/path`, `#!/path`) used by hash-routed apps.

/**
 * How the URL changed: the Navigation API's navigationType ("push",
 * "replace", "traverse", "reload"), or null when it isn't known.
 */
export interface RouteChange {
  navigationType: string | null;
}

type RouteChangeHandler = (change: RouteChange) => void;
type ContentReadyHandler = () => void;

const DOM_SETTLE_MS = 500;
const MUTATION_DEBOUNCE_MS = 50;

/** Navigation API isn't in every lib.dom version, so only rely on EventTarget. */
function getNavigation(): EventTarget | undefined {
  return (window as Window & { navigation?: EventTarget }).navigation;
}

/**
 * Observe SPA route changes and call `onRouteChange` immediately when one is
 * detected, then call `onContentReady` after the DOM settles.
 *
 * Returns a cleanup function that removes all listeners.
 */
export function observeRouteChanges(
  onRouteChange: RouteChangeHandler,
  onContentReady: ContentReadyHandler,
): () => void {
  let currentPath = currentRouteKey();
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  function handleChange(navigationType: string | null) {
    const newPath = currentRouteKey();
    if (newPath === currentPath) {
      return;
    }
    currentPath = newPath;

    onRouteChange({ navigationType });

    // Wait for the new page's DOM to settle before re-detecting content.
    clearTimeout(settleTimer);
    settleTimer = setTimeout(onContentReady, DOM_SETTLE_MS);
  }

  // Back/forward navigation; hashchange covers hash routes without the Navigation API
  const handleTraverse = () => handleChange("traverse");
  const handleHashChange = () => handleChange(null);
  window.addEventListener("popstate", handleTraverse);
  window.addEventListener("hashchange", handleHashChange);

  const navigation = getNavigation();
  const stopWatchingUrl = navigation
    ? watchNavigationEntries(navigation, handleChange)
    : watchDomMutations(() => handleChange(null));

  return () => {
    window.removeEventListener("popstate", handleTraverse);
    window.removeEventListener("hashchange", handleHashChange);
    stopWatchingUrl();
    clearTimeout(settleTimer);
  };
}

/** Pathname + search, plus the hash when it is a hash route (`#/`, `#!`). */
function currentRouteKey(): string {
  const hash = location.hash ?? "";
  const hashRoute = hash.startsWith("#/") || hash.startsWith("#!") ? hash : "";
  return location.pathname + location.search + hashRoute;
}

/** `currententrychange` fires once the new URL is committed, so check it right away. */
function watchNavigationEntries(
  navigation: EventTarget,
  onPossibleChange: (navigationType: string | null) => void,
): () => void {
  const handleEntryChange = (event: Event) => {
    onPossibleChange((event as Event & { navigationType?: string | null }).navigationType ?? null);
  };
  navigation.addEventListener("currententrychange", handleEntryChange);
  return () => navigation.removeEventListener("currententrychange", handleEntryChange);
}

/** Detect pushState/replaceState by checking the URL after DOM mutations settle briefly. */
function watchDomMutations(onPossibleChange: () => void): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(onPossibleChange, MUTATION_DEBOUNCE_MS);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    clearTimeout(debounceTimer);
  };
}

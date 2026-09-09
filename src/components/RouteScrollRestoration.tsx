import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";

const HASH_TARGET_WAIT_MS = 2_000;

const decodeHash = (hash: string) => {
  const value = hash.slice(1);

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const findHashTarget = (hash: string) => {
  const targetId = decodeHash(hash);

  if (!targetId) return null;

  return document.getElementById(targetId) ?? document.getElementsByName(targetId)[0] ?? null;
};

/**
 * New pages, reloads and history visits start at the top. Hash
 * links are the exception: they keep their native, target-specific behavior
 * even when a lazy route has not rendered its target yet.
 */
const RouteScrollRestoration = () => {
  const { key, pathname, search, hash } = useLocation();

  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    let observer: MutationObserver | undefined;
    let timeoutId: number | undefined;
    let animationFrameId: number | undefined;

    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });

    const scrollToHashTarget = () => {
      const target = findHashTarget(hash);

      if (!target) return false;

      target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
      return true;
    };

    const stopWatching = () => {
      observer?.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      observer = undefined;
      timeoutId = undefined;
    };

    const restorePosition = () => {
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
      stopWatching();
      scrollToTop();

      // One frame also covers the browser's history/layout work. No ongoing
      // top lock: users remain free to scroll once the new page is shown.
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = undefined;
        if (!hash) { scrollToTop(); return; }
        if (scrollToHashTarget()) return;

        observer = new MutationObserver(() => {
          if (scrollToHashTarget()) stopWatching();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        timeoutId = window.setTimeout(stopWatching, HASH_TARGET_WAIT_MS);
      });
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // A back/forward-cache return need not remount React or change its URL.
      if (event.persisted) restorePosition();
    };

    restorePosition();
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      if (animationFrameId !== undefined) window.cancelAnimationFrame(animationFrameId);
      stopWatching();
    };
  }, [key, pathname, search, hash]);

  return null;
};

export default RouteScrollRestoration;

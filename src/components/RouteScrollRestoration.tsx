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
 * New pages should never inherit the previous page's scroll position. Hash
 * links are the exception: they keep their native, target-specific behavior
 * even when a lazy route has not rendered its target yet.
 */
const RouteScrollRestoration = () => {
  const { pathname, hash } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo(0, 0);

    if (!hash) return undefined;

    let observer: MutationObserver | undefined;
    let timeoutId: number | undefined;

    const scrollToHashTarget = () => {
      const target = findHashTarget(hash);

      if (!target) return false;

      target.scrollIntoView({ block: "start", inline: "nearest" });
      return true;
    };

    const stopWatching = () => {
      observer?.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };

    const animationFrameId = window.requestAnimationFrame(() => {
      if (scrollToHashTarget()) return;

      observer = new MutationObserver(() => {
        if (scrollToHashTarget()) stopWatching();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeoutId = window.setTimeout(stopWatching, HASH_TARGET_WAIT_MS);
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      stopWatching();
    };
  }, [pathname, hash]);

  return null;
};

export default RouteScrollRestoration;

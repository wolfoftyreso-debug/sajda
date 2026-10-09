import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/** Only error-recovery links opt in. Normal navigation and hash focus are unchanged. */
export default function WebRecoveryFocus() {
  const { key, state } = useLocation();
  const requested = Boolean(state && typeof state === "object" && state.sajdaRecoveryFocus === true);
  const pending = useRef(false);
  useLayoutEffect(() => {
    if (requested) pending.current = true;
    // A protected destination may redirect to sign-in without carrying state.
    // Retain only this pending focus intent until a real heading appears.
    if (!pending.current) return;
    const focus = () => {
      const heading = document.querySelector<HTMLHeadingElement>("main h1, [role='main'] h1");
      if (!heading) return false;
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
      pending.current = false;
      return true;
    };
    // A lazy route may still be displaying its loading state. Wait briefly
    // for its real heading, without repeated navigation or indefinite work.
    if (focus()) return;
    const observer = new MutationObserver(() => { if (focus()) stop(); });
    const timer = window.setTimeout(() => { pending.current = false; stop(); }, 2_000);
    function stop() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    return stop;
  }, [key, requested]);
  return null;
}

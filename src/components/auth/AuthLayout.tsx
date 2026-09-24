import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bookmark, Layers3, Search } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useLanguage } from "@/i18n/LanguageProvider";
import { authPresentationCopy } from "@/i18n/authPresentationCopy";
import "./auth.css";

/** A shared presentation shell; authentication and recovery stay in Auth. */
export default function AuthLayout({ children, screen, backLabel }: { children: ReactNode; screen: string; backLabel: string }) {
  const { language } = useLanguage();
  const copy = authPresentationCopy[language];
  return (
    <div className="sajda-auth">
      <header className="sajda-auth-header">
        <Link to="/" className="sajda-auth-logo rounded-lg">
          <img src="/sajda-logo.svg" alt="Sajda" width="760" height="240" fetchPriority="high" />
        </Link>
        <Link to="/" className="sajda-auth-back">
          <ArrowLeft size={16} aria-hidden="true" />{backLabel}
        </Link>
      </header>

      <main className="sajda-auth-frame" data-auth-screen={screen}>
        <aside className="sajda-auth-brand">
          <div className="sajda-auth-emblem" aria-hidden="true">
            <div className="sajda-auth-orbit sajda-auth-orbit-outer" />
            <div className="sajda-auth-orbit sajda-auth-orbit-inner" />
            <div className="sajda-auth-emblem-tile"><img src="/sajda-mark.svg" alt="" width="200" height="240" /></div>
            <span className="sajda-auth-orbit-point" />
          </div>
          <div className="sajda-auth-brand-copy">
            <h2>{copy.brandHeading}</h2>
            <p>{copy.brandDescription}</p>
          </div>
          <div className="sajda-auth-features">
            <span><Search aria-hidden="true" />{copy.discover}</span>
            <span><Layers3 aria-hidden="true" />{copy.compare}</span>
            <span><Bookmark aria-hidden="true" />{copy.save}</span>
          </div>
        </aside>
        <section className="sajda-auth-content" aria-labelledby="auth-heading">
          <div className="sajda-auth-form-area">{children}</div>
          <p className="sajda-auth-account-note">{copy.oneAccount}</p>
        </section>
      </main>

      <footer className="sajda-auth-footer">
        <p>{copy.consent}{" "}<Link to="/legal#terms">{copy.terms}</Link>{" "}{copy.and}{" "}<Link to="/legal#privacy">{copy.privacy}</Link>{copy.end}</p>
        <LanguageSwitcher className="sajda-auth-language" />
      </footer>
    </div>
  );
}

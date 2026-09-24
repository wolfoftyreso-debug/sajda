import TradingPortal from "../../src/components/TradingPortal";
import { useLanguage } from "../../src/i18n/LanguageProvider";
export default function ResponsiveTrading() {
  const { language } = useLanguage();
  return <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8"><h1 id="plus-workspace-title" className="mb-6 text-2xl font-semibold">Trading portal — synthetic presentation fixture</h1><TradingPortal accountId="local-responsive-fixture" language={language} candidates={[]} now={Date.now()} onAccessLost={() => undefined} /></main>;
}

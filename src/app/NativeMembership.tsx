import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import AccountMembershipPanel from "@/components/AccountMembershipPanel";
import NativePurchaseNotice from "./NativePurchaseNotice";
import { nativeCopy } from "./nativeCopy";

export default function NativeMembership() {
  const { language } = useLanguage();
  const { user, loading } = useAuth();
  const copy = nativeCopy[language];
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-6" aria-labelledby="native-membership-title">
    <h1 id="native-membership-title" className="text-2xl font-semibold tracking-tight">{copy.membership}</h1>
    {user || loading ? <AccountMembershipPanel /> : <Link to="/auth?next=%2Fpricing" className="inline-flex min-h-11 items-center font-semibold text-primary underline">{copy.signIn}</Link>}
    <NativePurchaseNotice />
  </main>;
}

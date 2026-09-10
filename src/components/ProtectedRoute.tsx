import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/i18n/LanguageProvider";
import { isAnonymousSearchMode } from "@/lib/anonymousSearchMode";
import { accountAccessCopy } from "@/i18n/accountAccessCopy";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const publicSearchRoute = isAnonymousSearchMode() && (location.pathname === "/" || location.pathname === "/swipe");
  if (publicSearchRoute) return <>{children}</>;

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" aria-hidden="true" />
      <span className="sr-only">{accountAccessCopy[language].checking}</span>
    </div>
  );

  if (!user) {
    const next = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/auth?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;

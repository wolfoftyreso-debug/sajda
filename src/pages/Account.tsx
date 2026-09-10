import { Link, useNavigate } from "react-router-dom";
import { User, Mail, LogOut, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import FooterNav from "@/components/FooterNav";
import { useEffect, useState } from "react";
import { AccountPageSkeleton } from "@/components/PageSkeletons";
import { checkIsAdmin } from "@/lib/adminService";
import { useLanguage } from "@/i18n/LanguageProvider";
import { getMembershipCopy } from "@/i18n/membershipCopy";
import AccountMembershipPanel from "@/components/AccountMembershipPanel";
import AccountAppSessions from "@/components/AccountAppSessions";
import { isNativeApp } from "@/lib/appSurface";
import { nativeCopy } from "@/app/nativeCopy";

const accountMessages = {
  en: {
    signedOut: "Signed out",
    signedOutDescription: "You have been signed out.",
    profile: "Profile",
    accountInformation: "Account information",
    email: "Email",
    accountCreated: "Account created",
    lastSignIn: "Last sign-in",
    notAvailable: "Not available",
    adminSettings: "Admin settings",
    signOut: "Sign out",
  },
  sv: {
    signedOut: "Utloggad",
    signedOutDescription: "Du har loggats ut.",
    profile: "Profil",
    accountInformation: "Kontoinformation",
    email: "E-post",
    accountCreated: "Konto skapat",
    lastSignIn: "Senast inloggad",
    notAvailable: "Inte tillgängligt",
    adminSettings: "Admininställningar",
    signOut: "Logga ut",
  },
  es: {
    signedOut: "Sesión cerrada",
    signedOutDescription: "Has cerrado sesión.",
    profile: "Perfil",
    accountInformation: "Información de la cuenta",
    email: "Correo electrónico",
    accountCreated: "Cuenta creada",
    lastSignIn: "Último inicio de sesión",
    notAvailable: "No disponible",
    adminSettings: "Configuración de administración",
    signOut: "Cerrar sesión",
  },
  fr: {
    signedOut: "Déconnecté",
    signedOutDescription: "Vous avez été déconnecté.",
    profile: "Profil",
    accountInformation: "Informations sur le compte",
    email: "E-mail",
    accountCreated: "Compte créé",
    lastSignIn: "Dernière connexion",
    notAvailable: "Indisponible",
    adminSettings: "Paramètres d’administration",
    signOut: "Se déconnecter",
  },
  zh: {
    signedOut: "已退出登录",
    signedOutDescription: "你已退出登录。",
    profile: "个人资料",
    accountInformation: "账户信息",
    email: "电子邮箱",
    accountCreated: "账户创建时间",
    lastSignIn: "上次登录",
    notAvailable: "暂无信息",
    adminSettings: "管理设置",
    signOut: "退出登录",
  },
} as const;

const Account = () => {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const { language } = useLanguage();
  const copy = accountMessages[language];
  const membershipCopy = getMembershipCopy(language);
  const dateLocale = {
    en: "en-US",
    sv: "sv-SE",
    es: "es-ES",
    fr: "fr-FR",
    zh: "zh-CN",
  }[language];

  useEffect(() => {
    let active = true;
    setIsAdmin(false);
    if (user) void checkIsAdmin().then(value => { if (active) setIsAdmin(value); }).catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?next=%2Faccount", { replace: true });
    }
  }, [user, loading, navigate]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      toast({ title: copy.signedOut, description: copy.signedOutDescription });
      navigate("/");
    } catch {
      toast({
        title: {
          en: "Sign-out could not be confirmed. Please try again.",
          sv: "Utloggningen kunde inte bekräftas. Försök igen.",
          es: "No se pudo confirmar el cierre de sesión. Inténtalo de nuevo.",
          fr: "La déconnexion n’a pas pu être confirmée. Réessayez.",
          zh: "无法确认退出登录，请重试。",
        }[language],
        variant: "destructive",
      });
    } finally {
      setIsSigningOut(false);
    }
  };

  if (loading) {
    return (
      <>
        <AccountPageSkeleton />
        <FooterNav />
      </>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6" aria-labelledby="account-title">
        <Link to="/" className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0" />{membershipCopy.home}</Link>
        <header className="mb-6">
          <h1 id="account-title" className="text-3xl font-semibold tracking-tight">{membershipCopy.account}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">{membershipCopy.lead}</p>
        </header>
        <div className="space-y-6">
          <AccountMembershipPanel />
          {isNativeApp && <Link to="/more" className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 font-semibold text-primary focus-visible:ring-2 focus-visible:ring-ring">{nativeCopy[language].more}<span className="text-sm font-normal text-muted-foreground">{nativeCopy[language].marketplace} · API · {nativeCopy[language].help}</span></Link>}
          {/* Profile Card */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User aria-hidden="true" className="h-8 w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{copy.profile}</h2>
                <div className="mt-1 flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
                  <Mail aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-all">{user.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-4 font-semibold text-foreground">{copy.accountInformation}</h2>
            <dl className="space-y-3 text-sm">
              <div className="grid min-w-0 gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
                <dt className="text-muted-foreground">{copy.email}</dt>
                <dd className="min-w-0 break-all text-foreground sm:text-right">{user.email}</dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
                <dt className="text-muted-foreground">{copy.accountCreated}</dt>
                <dd className="text-foreground sm:text-right">
                  {new Date(user.created_at).toLocaleDateString(dateLocale)}
                </dd>
              </div>
              <div className="grid gap-1 sm:grid-cols-[1fr_2fr] sm:gap-4">
                <dt className="text-muted-foreground">{copy.lastSignIn}</dt>
                <dd className="text-foreground sm:text-right">
                  {user.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString(dateLocale)
                    : copy.notAvailable}
                </dd>
              </div>
            </dl>
          </div>

          {/* Admin Link */}
          <AccountAppSessions accountId={user.id} />
          {isAdmin && (
            <Button
              onClick={() => navigate('/admin')}
              variant="outline"
              className="w-full gap-2"
            >
              <Settings className="h-4 w-4" />
              {copy.adminSettings}
            </Button>
          )}

          {/* Sign Out */}
          <Button
            onClick={handleSignOut}
            disabled={isSigningOut}
            variant="outline"
            className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            <LogOut className="h-4 w-4" />
            {copy.signOut}
          </Button>
        </div>
      </main>

      <FooterNav />
    </div>
  );
};

export default Account;

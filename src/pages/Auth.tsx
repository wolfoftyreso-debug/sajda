import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Globe, Mail, Lock, Loader2, ArrowLeft, ArrowRight, CheckCircle2, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isAccountAuthConfigured, accountAuthUnavailableReason } from "@/integrations/neon/auth";
import { passwordRecoveryToken, safeAccountPath } from "@/lib/authNavigation";
import { useLanguage } from "@/i18n/LanguageProvider";
import { accountNavigationCopy } from "@/i18n/accountNavigationCopy";
import { accountAccessCopy } from "@/i18n/accountAccessCopy";
import { z } from "zod";

const authMessages = {
  en: {
    emailInvalid: "Enter a valid email address",
    passwordTooShort: "Use between 12 and 128 characters",
    passwordRequired: "Enter your password",
    emailUnavailable: "Account emails are not available yet. You can still search for domains without an account.",
    loginFailed: "Sign-in failed",
    invalidCredentials: "Invalid email or password. Please try again.",
    loginUnable: "We couldn't sign you in. Please try again.",
    welcomeBack: "Welcome back!",
    signedIn: "You are now signed in.",
    accountExists: "Account already exists",
    emailRegistered: "This email is already registered. Try signing in instead.",
    signUpFailed: "Sign-up failed",
    signUpUnable: "We couldn't create your account. Please try again.",
    accountCreated: "Account created!",
    confirmation: "Check your inbox to confirm your email, then sign in to save your domains.",
    tagline: "Domain discovery",
    welcomeBackHeading: "Welcome back",
    createAccount: "Create an account",
    accountAccess: "Sign in to your Sajda account",
    startWatching: "Save your domain ideas in one place",
    email: "Email",
    emailPlaceholder: "you@example.com",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in…",
    creatingAccount: "Creating account…",
    noAccount: "Don't have an account? ",
    alreadyHaveAccount: "Already have an account? ",
    register: "Sign up",
    terms: "By continuing, you agree to our Terms of Service and Privacy Policy.",
    unavailableTitle: "Account access is not available yet.",
    unavailableLocal: "Local test mode never creates or simulates Sajda accounts. Connect the account service in a deployed environment to sign in or create an account.",
    unavailableConfig: "You can try the domain search without an account. Sign-in and saving to an account are not available in this version yet.",
    backToSearch: "Back to search",
  },
  sv: {
    emailInvalid: "Ange en giltig e-postadress",
    passwordTooShort: "Använd mellan 12 och 128 tecken",
    passwordRequired: "Ange ditt lösenord",
    emailUnavailable: "Kontomejl är inte tillgängliga ännu. Du kan fortfarande söka domäner utan konto.",
    loginFailed: "Det gick inte att logga in",
    invalidCredentials: "E-postadressen eller lösenordet är fel. Försök igen.",
    loginUnable: "Det gick inte att logga in. Försök igen.",
    welcomeBack: "Välkommen tillbaka!",
    signedIn: "Du har loggats in.",
    accountExists: "Kontot finns redan",
    emailRegistered: "Den här e-postadressen är redan registrerad. Prova att logga in i stället.",
    signUpFailed: "Det gick inte att skapa kontot",
    signUpUnable: "Det gick inte att skapa kontot. Försök igen.",
    accountCreated: "Konto skapat!",
    confirmation: "Bekräfta din e-post via länken i inkorgen och logga sedan in för att spara dina domäner.",
    tagline: "Hitta domännamn",
    welcomeBackHeading: "Välkommen tillbaka",
    createAccount: "Skapa konto",
    accountAccess: "Logga in på ditt Sajda-konto",
    startWatching: "Samla dina domänidéer på ett ställe",
    email: "E-post",
    emailPlaceholder: "du@exempel.se",
    password: "Lösenord",
    signIn: "Logga in",
    signingIn: "Loggar in…",
    creatingAccount: "Skapar konto…",
    noAccount: "Har du inget konto? ",
    alreadyHaveAccount: "Har du redan ett konto? ",
    register: "Registrera dig",
    terms: "Genom att fortsätta godkänner du våra användarvillkor och vår integritetspolicy.",
    unavailableTitle: "Inloggningen är inte tillgänglig ännu.",
    unavailableLocal: "Lokalt testläge skapar eller simulerar aldrig Sajda-konton. Anslut kontotjänsten i en driftsatt miljö för att logga in eller skapa konto.",
    unavailableConfig: "Du kan prova domänsökningen utan konto. Inloggning och sparande till konto är inte tillgängliga i den här versionen ännu.",
    backToSearch: "Tillbaka till sökningen",
  },
  es: {
    emailInvalid: "Introduce una dirección de correo válida",
    passwordTooShort: "Usa entre 12 y 128 caracteres",
    passwordRequired: "Introduce tu contraseña",
    emailUnavailable: "Los correos de la cuenta aún no están disponibles. Puedes seguir buscando dominios sin una cuenta.",
    loginFailed: "No se pudo iniciar sesión",
    invalidCredentials: "El correo o la contraseña no son correctos. Inténtalo de nuevo.",
    loginUnable: "No hemos podido iniciar sesión. Inténtalo de nuevo.",
    welcomeBack: "¡Bienvenido de nuevo!",
    signedIn: "Has iniciado sesión.",
    accountExists: "La cuenta ya existe",
    emailRegistered: "Este correo ya está registrado. Prueba a iniciar sesión.",
    signUpFailed: "No se pudo crear la cuenta",
    signUpUnable: "No hemos podido crear tu cuenta. Inténtalo de nuevo.",
    accountCreated: "¡Cuenta creada!",
    confirmation: "Confirma tu correo con el enlace de la bandeja de entrada e inicia sesión para guardar tus dominios.",
    tagline: "Encuentra tu dominio",
    welcomeBackHeading: "Bienvenido de nuevo",
    createAccount: "Crear una cuenta",
    accountAccess: "Inicia sesión en tu cuenta de Sajda",
    startWatching: "Guarda tus ideas de dominios en un solo lugar",
    email: "Correo electrónico",
    emailPlaceholder: "tu@ejemplo.com",
    password: "Contraseña",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión…",
    creatingAccount: "Creando cuenta…",
    noAccount: "¿No tienes una cuenta? ",
    alreadyHaveAccount: "¿Ya tienes una cuenta? ",
    register: "Crear cuenta",
    terms: "Al continuar, aceptas los Términos de servicio y la Política de privacidad.",
    unavailableTitle: "El acceso a tu cuenta aún no está disponible.",
    unavailableLocal: "El modo de prueba local nunca crea ni simula cuentas de Sajda. Conecta el servicio de cuentas en un entorno desplegado para iniciar sesión o crear una cuenta.",
    unavailableConfig: "Puedes probar la búsqueda de dominios sin una cuenta. El inicio de sesión y el guardado en una cuenta aún no están disponibles en esta versión.",
    backToSearch: "Volver a la búsqueda",
  },
  fr: {
    emailInvalid: "Saisissez une adresse e-mail valide",
    passwordTooShort: "Utilisez entre 12 et 128 caractères",
    passwordRequired: "Saisissez votre mot de passe",
    emailUnavailable: "Les e-mails liés au compte ne sont pas encore disponibles. Vous pouvez toujours rechercher des domaines sans compte.",
    loginFailed: "Connexion impossible",
    invalidCredentials: "L’e-mail ou le mot de passe est incorrect. Réessayez.",
    loginUnable: "Nous n’avons pas pu vous connecter. Réessayez.",
    welcomeBack: "Bienvenue !",
    signedIn: "Vous êtes maintenant connecté.",
    accountExists: "Le compte existe déjà",
    emailRegistered: "Cette adresse e-mail est déjà enregistrée. Essayez de vous connecter.",
    signUpFailed: "Création du compte impossible",
    signUpUnable: "Nous n’avons pas pu créer votre compte. Réessayez.",
    accountCreated: "Compte créé !",
    confirmation: "Confirmez votre e-mail via le lien reçu, puis connectez-vous pour enregistrer vos domaines.",
    tagline: "Découverte de domaines",
    welcomeBackHeading: "Bienvenue",
    createAccount: "Créer un compte",
    accountAccess: "Connectez-vous à votre compte Sajda",
    startWatching: "Retrouvez vos idées de domaines au même endroit",
    email: "E-mail",
    emailPlaceholder: "vous@exemple.fr",
    password: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion…",
    creatingAccount: "Création du compte…",
    noAccount: "Vous n’avez pas de compte ? ",
    alreadyHaveAccount: "Vous avez déjà un compte ? ",
    register: "Créer un compte",
    terms: "En continuant, vous acceptez les Conditions d’utilisation et la Politique de confidentialité.",
    unavailableTitle: "L’accès au compte n’est pas encore disponible.",
    unavailableLocal: "Le mode de test local ne crée ni ne simule jamais de comptes Sajda. Connectez le service de comptes dans un environnement déployé pour vous connecter ou créer un compte.",
    unavailableConfig: "Vous pouvez essayer la recherche de domaines sans compte. La connexion et l’enregistrement dans un compte ne sont pas encore disponibles dans cette version.",
    backToSearch: "Retour à la recherche",
  },
  zh: {
    emailInvalid: "请输入有效的电子邮箱地址",
    passwordTooShort: "请使用 12 至 128 个字符",
    passwordRequired: "请输入密码",
    emailUnavailable: "账户邮件尚未启用。你仍可在不创建账户的情况下搜索域名。",
    loginFailed: "登录失败",
    invalidCredentials: "邮箱或密码不正确，请重试。",
    loginUnable: "暂时无法登录，请重试。",
    welcomeBack: "欢迎回来！",
    signedIn: "你已登录。",
    accountExists: "账户已存在",
    emailRegistered: "该邮箱已注册，请尝试登录。",
    signUpFailed: "无法创建账户",
    signUpUnable: "暂时无法创建账户，请重试。",
    accountCreated: "账户已创建！",
    confirmation: "请使用收件箱中的链接确认邮箱，然后登录并保存域名。",
    tagline: "寻找域名",
    welcomeBackHeading: "欢迎回来",
    createAccount: "创建账户",
    accountAccess: "登录你的 Sajda 账户",
    startWatching: "集中保存你的域名创意",
    email: "电子邮箱",
    emailPlaceholder: "you@example.com",
    password: "密码",
    signIn: "登录",
    signingIn: "正在登录…",
    creatingAccount: "正在创建账户…",
    noAccount: "还没有账户？",
    alreadyHaveAccount: "已经有账户？",
    register: "注册",
    terms: "继续即表示你同意服务条款和隐私政策。",
    unavailableTitle: "账户服务暂不可用。",
    unavailableLocal: "本地测试模式绝不会创建或模拟 Sajda 账户。请在已部署环境中连接账户服务后再登录或创建账户。",
    unavailableConfig: "你可以无需账户试用域名搜索。此版本尚未提供登录和账户保存功能。",
    backToSearch: "返回搜索",
  },
} as const;

const passwordRecoveryMessages = {
  en: {
    forgotPassword: "Forgot password?",
    resetPasswordHeading: "Reset your password",
    resetPasswordDescription: "Enter your email and we’ll send a secure reset link.",
    sendResetLink: "Send reset link",
    sendingResetLink: "Sending reset link…",
    resetEmailSentHeading: "Check your inbox",
    resetEmailSent: "If that email belongs to a Sajda account, we’ve sent a reset link.",
    resetEmailSentDetail: "Open the link to choose a new password. Each link can be used once.",
    resetRequestFailed: "Couldn’t send reset link",
    resetRequestUnable: "We couldn’t start password recovery. Please try again.",
    backToSignIn: "Back to sign in",
    setNewPasswordHeading: "Set a new password",
    setNewPasswordDescription: "Choose a new password for your Sajda account.",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordMismatch: "The passwords do not match",
    updatePassword: "Update password",
    updatingPassword: "Updating password…",
    passwordUpdatedHeading: "Password updated",
    passwordUpdated: "Your new password is saved. Use it the next time you sign in.",
    continueToSajda: "Continue to Sajda",
    passwordUpdateFailed: "Couldn’t update password",
    passwordUpdateUnable: "We couldn’t update your password. Request a new reset link and try again.",
    resetLinkInvalidHeading: "This reset link is invalid or expired",
    resetLinkInvalid: "Request a new link and open the latest email.",
    requestNewResetLink: "Request a new reset link",
    checkingResetLink: "Checking reset link…",
  },
  sv: {
    forgotPassword: "Glömt lösenordet?",
    resetPasswordHeading: "Återställ ditt lösenord",
    resetPasswordDescription: "Ange din e-postadress så skickar vi en säker återställningslänk.",
    sendResetLink: "Skicka återställningslänk",
    sendingResetLink: "Skickar återställningslänk…",
    resetEmailSentHeading: "Kontrollera din inkorg",
    resetEmailSent: "Om e-postadressen hör till ett Sajda-konto har vi skickat en återställningslänk.",
    resetEmailSentDetail: "Öppna länken för att välja ett nytt lösenord. Varje länk kan användas en gång.",
    resetRequestFailed: "Det gick inte att skicka länken",
    resetRequestUnable: "Det gick inte att starta lösenordsåterställningen. Försök igen.",
    backToSignIn: "Tillbaka till inloggning",
    setNewPasswordHeading: "Välj ett nytt lösenord",
    setNewPasswordDescription: "Välj ett nytt lösenord för ditt Sajda-konto.",
    newPassword: "Nytt lösenord",
    confirmPassword: "Bekräfta nytt lösenord",
    passwordMismatch: "Lösenorden matchar inte",
    updatePassword: "Uppdatera lösenord",
    updatingPassword: "Uppdaterar lösenord…",
    passwordUpdatedHeading: "Lösenordet är uppdaterat",
    passwordUpdated: "Ditt nya lösenord är sparat. Använd det nästa gång du loggar in.",
    continueToSajda: "Fortsätt till Sajda",
    passwordUpdateFailed: "Det gick inte att uppdatera lösenordet",
    passwordUpdateUnable: "Det gick inte att uppdatera lösenordet. Begär en ny återställningslänk och försök igen.",
    resetLinkInvalidHeading: "Återställningslänken är ogiltig eller har gått ut",
    resetLinkInvalid: "Begär en ny länk och öppna det senaste mejlet.",
    requestNewResetLink: "Begär en ny återställningslänk",
    checkingResetLink: "Kontrollerar återställningslänken…",
  },
  es: {
    forgotPassword: "¿Has olvidado tu contraseña?",
    resetPasswordHeading: "Restablece tu contraseña",
    resetPasswordDescription: "Introduce tu correo y te enviaremos un enlace seguro.",
    sendResetLink: "Enviar enlace de restablecimiento",
    sendingResetLink: "Enviando enlace…",
    resetEmailSentHeading: "Revisa tu correo",
    resetEmailSent: "Si ese correo pertenece a una cuenta de Sajda, hemos enviado un enlace.",
    resetEmailSentDetail: "Abre el enlace para elegir una contraseña nueva. Cada enlace se puede usar una vez.",
    resetRequestFailed: "No se pudo enviar el enlace",
    resetRequestUnable: "No hemos podido iniciar el restablecimiento. Inténtalo de nuevo.",
    backToSignIn: "Volver al inicio de sesión",
    setNewPasswordHeading: "Elige una contraseña nueva",
    setNewPasswordDescription: "Elige una contraseña nueva para tu cuenta de Sajda.",
    newPassword: "Nueva contraseña",
    confirmPassword: "Confirmar nueva contraseña",
    passwordMismatch: "Las contraseñas no coinciden",
    updatePassword: "Actualizar contraseña",
    updatingPassword: "Actualizando contraseña…",
    passwordUpdatedHeading: "Contraseña actualizada",
    passwordUpdated: "Tu nueva contraseña se ha guardado. Úsala la próxima vez que inicies sesión.",
    continueToSajda: "Continuar a Sajda",
    passwordUpdateFailed: "No se pudo actualizar la contraseña",
    passwordUpdateUnable: "No hemos podido actualizar tu contraseña. Solicita un enlace nuevo e inténtalo de nuevo.",
    resetLinkInvalidHeading: "Este enlace no es válido o ha caducado",
    resetLinkInvalid: "Solicita un enlace nuevo y abre el correo más reciente.",
    requestNewResetLink: "Solicitar un enlace nuevo",
    checkingResetLink: "Comprobando el enlace…",
  },
  fr: {
    forgotPassword: "Mot de passe oublié ?",
    resetPasswordHeading: "Réinitialisez votre mot de passe",
    resetPasswordDescription: "Saisissez votre e-mail et nous vous enverrons un lien sécurisé.",
    sendResetLink: "Envoyer le lien de réinitialisation",
    sendingResetLink: "Envoi du lien…",
    resetEmailSentHeading: "Consultez votre boîte de réception",
    resetEmailSent: "Si cette adresse correspond à un compte Sajda, nous avons envoyé un lien.",
    resetEmailSentDetail: "Ouvrez le lien pour choisir un nouveau mot de passe. Chaque lien est à usage unique.",
    resetRequestFailed: "Impossible d’envoyer le lien",
    resetRequestUnable: "Nous n’avons pas pu démarrer la réinitialisation. Réessayez.",
    backToSignIn: "Retour à la connexion",
    setNewPasswordHeading: "Choisissez un nouveau mot de passe",
    setNewPasswordDescription: "Choisissez un nouveau mot de passe pour votre compte Sajda.",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le nouveau mot de passe",
    passwordMismatch: "Les mots de passe ne correspondent pas",
    updatePassword: "Mettre à jour le mot de passe",
    updatingPassword: "Mise à jour…",
    passwordUpdatedHeading: "Mot de passe mis à jour",
    passwordUpdated: "Votre nouveau mot de passe est enregistré. Utilisez-le lors de votre prochaine connexion.",
    continueToSajda: "Continuer vers Sajda",
    passwordUpdateFailed: "Impossible de mettre à jour le mot de passe",
    passwordUpdateUnable: "Nous n’avons pas pu mettre à jour votre mot de passe. Demandez un nouveau lien et réessayez.",
    resetLinkInvalidHeading: "Ce lien est invalide ou expiré",
    resetLinkInvalid: "Demandez un nouveau lien et ouvrez le dernier e-mail reçu.",
    requestNewResetLink: "Demander un nouveau lien",
    checkingResetLink: "Vérification du lien…",
  },
  zh: {
    forgotPassword: "忘记密码？",
    resetPasswordHeading: "重置密码",
    resetPasswordDescription: "输入你的邮箱，我们会发送安全的重置链接。",
    sendResetLink: "发送重置链接",
    sendingResetLink: "正在发送链接…",
    resetEmailSentHeading: "查看收件箱",
    resetEmailSent: "如果该邮箱属于 Sajda 账户，我们已发送重置链接。",
    resetEmailSentDetail: "打开链接并设置新密码。每个链接只能使用一次。",
    resetRequestFailed: "无法发送重置链接",
    resetRequestUnable: "暂时无法开始重置密码，请重试。",
    backToSignIn: "返回登录",
    setNewPasswordHeading: "设置新密码",
    setNewPasswordDescription: "为你的 Sajda 账户设置新密码。",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    passwordMismatch: "两次输入的密码不一致",
    updatePassword: "更新密码",
    updatingPassword: "正在更新密码…",
    passwordUpdatedHeading: "密码已更新",
    passwordUpdated: "新密码已保存，下次登录时请使用新密码。",
    continueToSajda: "继续前往 Sajda",
    passwordUpdateFailed: "无法更新密码",
    passwordUpdateUnable: "暂时无法更新密码。请请求新链接后重试。",
    resetLinkInvalidHeading: "此重置链接无效或已过期",
    resetLinkInvalid: "请请求新链接，然后打开最新收到的邮件。",
    requestNewResetLink: "请求新重置链接",
    checkingResetLink: "正在检查重置链接…",
  },
} as const;

type AuthScreen = "sign-in" | "sign-up" | "request-reset" | "update-password";

function screenFromRequestedMode(mode: string | null): AuthScreen {
  if (mode === "signup") return "sign-up";
  if (mode === "reset") return "request-reset";
  if (mode === "update-password") return "update-password";
  return "sign-in";
}

const Auth = () => {
  const location = useLocation();
  const requestedMode = new URLSearchParams(location.search).get("mode");
  const [screen, setScreen] = useState<AuthScreen>(() => screenFromRequestedMode(requestedMode));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState(() => passwordRecoveryToken(location.search));
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  const { signIn, signUp, requestPasswordReset, requestEmailVerification, updatePassword, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const copy = { ...authMessages[language], ...passwordRecoveryMessages[language] };
  const requestedNext = new URLSearchParams(location.search).get("next");
  const nextPath = safeAccountPath(requestedNext);
  const isSignIn = screen === "sign-in";
  const isSignUp = screen === "sign-up";
  const isResetRequest = screen === "request-reset";
  const isPasswordUpdate = screen === "update-password";
  const verifyCopy = accountAccessCopy[language].verification;

  useEffect(() => {
    setScreen(screenFromRequestedMode(requestedMode));
    setErrors({});
    setFormError(null);
    setResetEmailSent(false);
    setPasswordUpdated(false);
    if (requestedMode !== "update-password") setRecoveryToken(null);
  }, [requestedMode]);

  // Recovery is authorized by a one-use server-issued token, never by an ordinary
  // signed-in session. Keep it in memory and remove it from visible navigation.
  useEffect(() => {
    const token = passwordRecoveryToken(location.search);
    if (!token) return;
    setRecoveryToken(token);
    const params = new URLSearchParams(location.search);
    params.delete("token");
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!authLoading && user && !isPasswordUpdate) {
      navigate(nextPath, { replace: true });
    }
  }, [user, authLoading, navigate, nextPath, isPasswordUpdate]);

  const changeScreen = (nextScreen: AuthScreen) => {
    const params = new URLSearchParams();
    if (nextScreen === "sign-up") params.set("mode", "signup");
    if (nextScreen === "request-reset") params.set("mode", "reset");
    if (nextScreen === "update-password") params.set("mode", "update-password");
    if (nextPath !== "/") params.set("next", nextPath);

    navigate({
      pathname: "/auth",
      search: params.size > 0 ? `?${params.toString()}` : "",
    });
  };

  if (!isAccountAuthConfigured) {
    const unavailableBody = accountAuthUnavailableReason === "local_test"
      ? copy.unavailableLocal
      : copy.unavailableConfig;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-[0_18px_52px_hsl(219_44%_12%/0.08)] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
            <Globe className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">{accountAccessCopy[language].accountLabel}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-foreground">{copy.unavailableTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{unavailableBody}</p>
          <Button type="button" onClick={() => navigate("/")} className="mt-6">
            {copy.backToSearch}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </section>
      </div>
    );
  }

  const validateEmail = () => {
    const emailResult = z.string().email(copy.emailInvalid).safeParse(email.trim());
    if (emailResult.success) return true;

    setErrors({ email: emailResult.error.errors[0]?.message ?? copy.emailInvalid });
    return false;
  };

  const validateCredentials = () => {
    const newErrors: { email?: string; password?: string } = {};
    const emailResult = z.string().email(copy.emailInvalid).safeParse(email.trim());
    const passwordResult = (isSignIn ? z.string().min(1, copy.passwordRequired) : z.string().min(12, copy.passwordTooShort)).max(128, copy.passwordTooShort).safeParse(password);

    if (!emailResult.success) newErrors.email = emailResult.error.errors[0]?.message ?? copy.emailInvalid;
    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0]?.message ?? copy.passwordTooShort;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateNewPassword = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};
    const passwordResult = z.string().min(12, copy.passwordTooShort).max(128, copy.passwordTooShort).safeParse(password);

    if (!passwordResult.success) newErrors.password = passwordResult.error.errors[0]?.message ?? copy.passwordTooShort;
    if (password !== confirmPassword) newErrors.confirmPassword = copy.passwordMismatch;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Only known codes choose UI text; raw provider/server messages stay hidden.
  const serviceErrorMessage = (error: Error, fallback: string) => {
    const code = "code" in error ? String(error.code).toLowerCase() : "";
    if (code === "email_not_configured") return copy.emailUnavailable;
    if (["too_many_requests", "rate_limit_exceeded"].includes(code)) return verifyCopy.wait;
    if (["password_too_short", "password_too_long"].includes(code)) return copy.passwordTooShort;
    return fallback;
  };

  const handleCredentialsSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setFormError(null);

    if (!validateCredentials()) return;
    setLoading(true);

    try {
      if (isSignIn) {
        const { error } = await signIn(email, password);
        if (error) {
          const code = "code" in error ? String(error.code) : "";
          const isInvalidCredentials = ["INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "USER_NOT_FOUND"].includes(code);
          const needsVerification = code === "EMAIL_NOT_VERIFIED";
          setVerificationRequired(needsVerification);
          const message = serviceErrorMessage(error, needsVerification ? verifyCopy.required : isInvalidCredentials ? copy.invalidCredentials : copy.loginUnable);
          setFormError(message);
          toast({ title: copy.loginFailed, description: message, variant: "destructive" });
          return;
        }

        toast({ title: copy.welcomeBack, description: copy.signedIn });
        navigate(nextPath, { replace: true });
        return;
      }

      // `nextPath` is already limited to a relative Sajda path. Passing it
      // through keeps confirmation-email visitors headed back to the product
      // surface that requested an account.
      const { error } = await signUp(email, password, nextPath);
      if (error) {
        const code = "code" in error ? String(error.code) : "";
        const isRegistered = ["USER_ALREADY_EXISTS", "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"].includes(code);
        const message = serviceErrorMessage(error, isRegistered ? copy.emailRegistered : copy.signUpUnable);
        setFormError(message);
        toast({
          title: isRegistered ? copy.accountExists : copy.signUpFailed,
          description: message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: copy.accountCreated, description: copy.confirmation });
      setVerificationRequired(true);
      changeScreen("sign-in");
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequestSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setFormError(null);

    if (!validateEmail()) return;
    setLoading(true);

    try {
      const { error } = await requestPasswordReset(email, nextPath);
      if (error) {
        const message = serviceErrorMessage(error, copy.resetRequestUnable);
        setFormError(message);
        toast({ title: copy.resetRequestFailed, description: message, variant: "destructive" });
        return;
      }

      // Keep the provider's recovery response non-enumerating.
      setResetEmailSent(true);
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationRequest = async () => {
    if (loading || !validateEmail()) return;
    setLoading(true);
    try {
      const result = await requestEmailVerification(email, nextPath);
      if (result.error) setFormError(serviceErrorMessage(result.error, verifyCopy.failed));
      else {
        setFormError(null);
        toast({ title: copy.resetEmailSentHeading, description: verifyCopy.sent });
      }
    } finally { setLoading(false); }
  };

  const handlePasswordUpdateSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setFormError(null);

    if (!validateNewPassword()) return;
    setLoading(true);

    try {
      const { error } = await updatePassword(password, recoveryToken ?? undefined);
      if (error) {
        const message = serviceErrorMessage(error, copy.passwordUpdateUnable);
        setFormError(message);
        toast({ title: copy.passwordUpdateFailed, description: message, variant: "destructive" });
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setPasswordUpdated(true);
      toast({ title: copy.passwordUpdatedHeading, description: copy.passwordUpdated });
    } finally {
      setLoading(false);
    }
  };

  const renderEmailField = () => (
    <div className="space-y-2">
      <Label htmlFor="email" className="text-foreground">{copy.email}</Label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setVerificationRequired(false);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          className="border-border bg-secondary pl-10"
          disabled={loading}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          autoFocus
        />
      </div>
      {errors.email && <p id="email-error" className="text-xs text-destructive">{errors.email}</p>}
    </div>
  );

  const renderPasswordField = ({ confirm = false }: { confirm?: boolean } = {}) => {
    const fieldId = confirm ? "confirm-password" : "password";
    const fieldLabel = confirm ? copy.confirmPassword : (isPasswordUpdate ? copy.newPassword : copy.password);
    const error = confirm ? errors.confirmPassword : errors.password;
    const value = confirm ? confirmPassword : password;
    const setValue = confirm ? setConfirmPassword : setPassword;

    return (
      <div className="space-y-2">
        <Label htmlFor={fieldId} className="text-foreground">{fieldLabel}</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={fieldId}
            type="password"
            minLength={isSignIn ? 1 : 12}
            maxLength={128}
            autoComplete={isPasswordUpdate ? "new-password" : (isSignUp ? "new-password" : "current-password")}
            placeholder="••••••••"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setErrors((current) => ({ ...current, [confirm ? "confirmPassword" : "password"]: undefined }));
            }}
            className="border-border bg-secondary pl-10"
            disabled={loading}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${fieldId}-error` : !isSignIn && !confirm ? "password-requirements" : undefined}
          />
        </div>
        {!isSignIn && !confirm && <p id="password-requirements" className="text-xs text-muted-foreground">{copy.passwordTooShort}</p>}
        {error && <p id={`${fieldId}-error`} className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  const renderFormError = () => formError ? (
    <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {formError}
    </p>
  ) : null;

  const title = isSignIn
    ? copy.welcomeBackHeading
    : isSignUp
      ? copy.createAccount
      : isResetRequest
        ? copy.resetPasswordHeading
        : copy.setNewPasswordHeading;
  const description = isSignIn
    ? copy.accountAccess
    : isSignUp
      ? copy.startWatching
      : isResetRequest
        ? copy.resetPasswordDescription
        : copy.setNewPasswordDescription;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-60 w-60 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary glow-primary">
            <Globe className="h-7 w-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sajda</h1>
          <p className="text-sm text-muted-foreground">{copy.tagline}</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 sm:p-8">
          {isPasswordUpdate && authLoading ? (
            <div className="flex flex-col items-center gap-3 py-7 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{copy.checkingResetLink}</p>
            </div>
          ) : isPasswordUpdate && !recoveryToken && !passwordUpdated ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-destructive/15 bg-destructive/[0.06] text-destructive">
                <KeyRound className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-foreground">{copy.resetLinkInvalidHeading}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.resetLinkInvalid}</p>
              <Button type="button" onClick={() => changeScreen("request-reset")} className="mt-6 w-full gap-2">
                {copy.requestNewResetLink}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
              <button type="button" onClick={() => changeScreen("sign-in")} className="mt-4 text-sm text-muted-foreground hover:text-primary">
                {copy.backToSignIn}
              </button>
            </div>
          ) : isPasswordUpdate && passwordUpdated ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-foreground">{copy.passwordUpdatedHeading}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.passwordUpdated}</p>
              <Button type="button" onClick={() => user ? navigate(nextPath) : changeScreen("sign-in")} className="mt-6 w-full gap-2">
                {user ? copy.continueToSajda : copy.backToSignIn}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : isResetRequest && resetEmailSent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                <Mail className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-foreground">{copy.resetEmailSentHeading}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.resetEmailSent}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.resetEmailSentDetail}</p>
              <button type="button" onClick={() => changeScreen("sign-in")} className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {copy.backToSignIn}
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 text-center">
                <h2 className="text-xl font-semibold text-foreground">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                {(isSignIn || isSignUp) && <p className="mt-3 text-sm leading-6 text-muted-foreground">{accountNavigationCopy[language].oneAccount}</p>}
              </div>

              {(isSignIn || isSignUp) && (
                <form noValidate onSubmit={handleCredentialsSubmit} className="space-y-4">
                  {renderEmailField()}
                  {renderPasswordField()}
                  {renderFormError()}
                  {isSignIn && verificationRequired && (
                    <Button type="button" variant="outline" disabled={loading} onClick={() => void handleVerificationRequest()} className="w-full whitespace-normal">
                      {verifyCopy.resend}
                    </Button>
                  )}
                  {isSignIn && (
                    <div className="flex justify-end">
                      <button type="button" onClick={() => changeScreen("request-reset")} className="text-sm font-medium text-primary hover:text-primary/80">
                        {copy.forgotPassword}
                      </button>
                    </div>
                  )}
                  <Button type="submit" disabled={loading} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>{isSignIn ? copy.signingIn : copy.creatingAccount}</span></>
                    ) : (
                      <>{isSignIn ? copy.signIn : copy.createAccount}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                    )}
                  </Button>
                </form>
              )}

              {isResetRequest && (
                <form noValidate onSubmit={handleResetRequestSubmit} className="space-y-4">
                  {renderEmailField()}
                  {renderFormError()}
                  <Button type="submit" disabled={loading} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>{copy.sendingResetLink}</span></>
                    ) : (
                      <>{copy.sendResetLink}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                    )}
                  </Button>
                </form>
              )}

              {isPasswordUpdate && (
                <form noValidate onSubmit={handlePasswordUpdateSubmit} className="space-y-4">
                  {renderPasswordField()}
                  {renderPasswordField({ confirm: true })}
                  {renderFormError()}
                  <Button type="submit" disabled={loading} className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                    {loading ? (
                      <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /><span>{copy.updatingPassword}</span></>
                    ) : (
                      <>{copy.updatePassword}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>
                    )}
                  </Button>
                </form>
              )}

              <div className="mt-6 text-center">
                {isSignIn || isSignUp ? (
                  <button type="button" onClick={() => changeScreen(isSignIn ? "sign-up" : "sign-in")} className="text-sm text-muted-foreground hover:text-primary">
                    {isSignIn ? copy.noAccount : copy.alreadyHaveAccount}
                    <span className="font-medium text-primary">{isSignIn ? copy.register : copy.signIn}</span>
                  </button>
                ) : (
                  <button type="button" onClick={() => changeScreen("sign-in")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    {copy.backToSignIn}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">{copy.terms}</p>
      </div>
    </div>
  );
};

export default Auth;

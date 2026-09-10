import type { Language } from "./LanguageProvider";

const en = {
  accountLabel: "Sajda account", checking: "Checking your sign-in…",
  appAuth: {
    body: "Use your existing Sajda account. Sign-in, registration and account recovery open in your iPhone’s secure system browser.",
    preview: "This is a browser preview of the app. App sign-in requires the iOS app running on an iPhone and cannot be tested here.",
    waiting: "Waiting for sign-in…", error: "Sign-in did not finish. It may have been canceled, or the connection may have failed. Try again.",
  },
  verification: {
    required: "Confirm your email address using the link in your inbox before signing in.",
    resend: "Send a new confirmation link",
    sent: "If this account needs email confirmation, we have sent a new link.",
    failed: "We could not send the link. Wait a moment and try again.",
    wait: "Too many attempts. Wait a few minutes and try again.",
  },
  native: {
    title: "Sign in to the Sajda app", warning: "Continue only if you just started signing in from Sajda’s iPhone app.",
    permission: "The app can access your account, saved domains, API keys and plan features, and manage app sign-ins. This does not authorize any purchase.",
    invalid: "Start signing in again from the Sajda app.", checking: "Checking your account…", signIn: "Sign in",
    connecting: "Connecting…", connect: "Connect my account to the app",
    failed: "We could not connect your account. Start signing in again from the app.", cancel: "Cancel",
  },
};

export const accountAccessCopy: Record<Language, typeof en> = {
  en,
  sv: {
    accountLabel: "Sajda-konto", checking: "Kontrollerar din inloggning…",
    appAuth: {
      body: "Använd ditt vanliga Sajda-konto. Inloggning, registrering och kontoåterställning öppnas i din iPhones säkra systemwebbläsare.",
      preview: "Det här är en förhandsvisning av appen i webbläsaren. Appinloggningen kräver iPhone-appen på en iPhone och kan inte testas här.",
      waiting: "Väntar på inloggning…", error: "Inloggningen slutfördes inte. Den kan ha avbrutits eller anslutningen kan ha misslyckats. Försök igen.",
    },
    verification: {
      required: "Bekräfta din e-postadress via länken i inkorgen innan du loggar in.", resend: "Skicka en ny bekräftelselänk",
      sent: "Om e-postadressen behöver bekräftas har vi skickat en ny länk.", failed: "Vi kunde inte skicka länken. Vänta en stund och försök igen.",
      wait: "För många försök. Vänta några minuter och försök igen.",
    },
    native: {
      title: "Logga in i Sajda-appen", warning: "Fortsätt bara om du själv precis startade inloggningen i Sajdas iPhone-app.",
      permission: "Appen får tillgång till ditt konto, sparade domäner, API-nycklar och funktionerna i din nivå. Den får också hantera appinloggningar. Du godkänner inga köp här.",
      invalid: "Starta inloggningen på nytt från Sajda-appen.", checking: "Kontrollerar ditt konto…", signIn: "Logga in",
      connecting: "Ansluter…", connect: "Anslut mitt konto till appen", failed: "Vi kunde inte ansluta ditt konto. Starta inloggningen på nytt från appen.", cancel: "Avbryt",
    },
  },
  es: {
    accountLabel: "Cuenta de Sajda", checking: "Comprobando tu sesión…",
    appAuth: {
      body: "Usa tu cuenta habitual de Sajda. El inicio de sesión, el registro y la recuperación de la cuenta se abren en el navegador seguro del sistema de tu iPhone.",
      preview: "Esta es una vista previa de la aplicación en el navegador. Para probar el inicio de sesión necesitas la aplicación de iOS en un iPhone; no se puede probar aquí.",
      waiting: "Esperando el inicio de sesión…", error: "El inicio de sesión no se completó. Es posible que lo hayas cancelado o que haya fallado la conexión. Inténtalo de nuevo.",
    },
    verification: {
      required: "Confirma tu dirección de correo con el enlace recibido antes de iniciar sesión.", resend: "Enviar un nuevo enlace de confirmación",
      sent: "Si esta cuenta necesita confirmar el correo, hemos enviado un nuevo enlace.", failed: "No pudimos enviar el enlace. Espera un momento e inténtalo de nuevo.",
      wait: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    },
    native: {
      title: "Inicia sesión en la aplicación de Sajda", warning: "Continúa solo si acabas de iniciar este proceso desde la aplicación de Sajda para iPhone.",
      permission: "La aplicación podrá acceder a tu cuenta, tus dominios guardados, tus claves API y las funciones de tu plan, y gestionar las sesiones de la aplicación. Esto no autoriza ninguna compra.",
      invalid: "Vuelve a iniciar sesión desde la aplicación de Sajda.", checking: "Comprobando tu cuenta…", signIn: "Iniciar sesión",
      connecting: "Conectando…", connect: "Conectar mi cuenta a la aplicación", failed: "No pudimos conectar tu cuenta. Vuelve a iniciar sesión desde la aplicación.", cancel: "Cancelar",
    },
  },
  fr: {
    accountLabel: "Compte Sajda", checking: "Vérification de votre connexion…",
    appAuth: {
      body: "Utilisez votre compte Sajda habituel. La connexion, l’inscription et la récupération du compte s’ouvrent dans le navigateur système sécurisé de votre iPhone.",
      preview: "Vous consultez un aperçu de l’application dans le navigateur. La connexion à l’application nécessite l’application iOS sur un iPhone ; elle ne peut pas être testée ici.",
      waiting: "En attente de connexion…", error: "La connexion n’a pas abouti. Elle a peut-être été annulée ou interrompue par un problème de réseau. Réessayez.",
    },
    verification: {
      required: "Confirmez votre adresse e-mail avec le lien reçu avant de vous connecter.", resend: "Envoyer un nouveau lien de confirmation",
      sent: "Si cette adresse e-mail doit être confirmée, nous avons envoyé un nouveau lien.", failed: "Nous n’avons pas pu envoyer le lien. Patientez un instant, puis réessayez.",
      wait: "Trop de tentatives. Patientez quelques minutes, puis réessayez.",
    },
    native: {
      title: "Connectez-vous à l’application Sajda", warning: "Continuez uniquement si vous venez de lancer la connexion depuis l’application iPhone de Sajda.",
      permission: "L’application pourra accéder à votre compte, à vos domaines enregistrés, à vos clés API et aux fonctions de votre offre, et gérer les connexions de l’application. Cela n’autorise aucun achat.",
      invalid: "Relancez la connexion depuis l’application Sajda.", checking: "Vérification de votre compte…", signIn: "Se connecter",
      connecting: "Connexion en cours…", connect: "Associer mon compte à l’application", failed: "Nous n’avons pas pu associer votre compte. Relancez la connexion depuis l’application.", cancel: "Annuler",
    },
  },
  zh: {
    accountLabel: "Sajda 账户", checking: "正在检查登录状态…",
    appAuth: {
      body: "使用你现有的 Sajda 账户。登录、注册和账户恢复页面会在 iPhone 的安全系统浏览器中打开。",
      preview: "这是在浏览器中显示的应用预览。应用登录需要在 iPhone 上运行 iOS 应用，无法在此测试。",
      waiting: "正在等待登录…", error: "登录未完成，可能是操作已取消或网络连接失败。请重试。",
    },
    verification: {
      required: "请先通过收件箱中的链接验证电子邮箱，然后登录。", resend: "重新发送验证链接",
      sent: "如果此账户尚未验证邮箱，我们已发送新的验证链接。", failed: "无法发送链接，请稍后重试。", wait: "尝试次数过多，请几分钟后再试。",
    },
    native: {
      title: "登录 Sajda 应用", warning: "只有在你刚刚从 Sajda 的 iPhone 应用中发起登录时，才应继续。",
      permission: "应用将能够访问你的账户、已保存的域名、API 密钥和方案功能，并管理应用登录。这不会授权任何购买。",
      invalid: "请从 Sajda 应用重新发起登录。", checking: "正在检查账户…", signIn: "登录", connecting: "正在连接…", connect: "将我的账户连接到应用",
      failed: "无法连接你的账户，请从应用重新发起登录。", cancel: "取消",
    },
  },
};

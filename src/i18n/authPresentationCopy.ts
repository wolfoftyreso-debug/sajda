import type { Language } from "./LanguageProvider";

export const authPresentationCopy = {
  en: {
    brandHeading: "A home for your best names.",
    brandDescription: "Find, compare and build on your next idea.",
    discover: "Discover", compare: "Compare", save: "Save",
    oneAccount: "One Sajda account. The same sign-in for every plan.",
    showPassword: "Show password", hidePassword: "Hide password",
    showConfirmation: "Show password confirmation", hideConfirmation: "Hide password confirmation",
    legalLead: "Read our", terms: "Terms of Service", and: "and", privacy: "Privacy Policy", end: ".",
  },
  sv: {
    brandHeading: "En plats för dina bästa namn.",
    brandDescription: "Hitta, jämför och utveckla din nästa idé.",
    discover: "Upptäck", compare: "Jämför", save: "Spara",
    oneAccount: "Ett Sajda-konto. Samma inloggning för alla nivåer.",
    showPassword: "Visa lösenord", hidePassword: "Dölj lösenord",
    showConfirmation: "Visa lösenordsbekräftelse", hideConfirmation: "Dölj lösenordsbekräftelse",
    legalLead: "Läs våra", terms: "användarvillkor", and: "och vår", privacy: "integritetspolicy", end: ".",
  },
  es: {
    brandHeading: "Un lugar para tus mejores nombres.",
    brandDescription: "Encuentra, compara y desarrolla tu próxima idea.",
    discover: "Descubre", compare: "Compara", save: "Guarda",
    oneAccount: "Una cuenta de Sajda. El mismo acceso para todos los planes.",
    showPassword: "Mostrar contraseña", hidePassword: "Ocultar contraseña",
    showConfirmation: "Mostrar confirmación de contraseña", hideConfirmation: "Ocultar confirmación de contraseña",
    legalLead: "Consulta nuestros", terms: "Términos de servicio", and: "y nuestra", privacy: "Política de privacidad", end: ".",
  },
  fr: {
    brandHeading: "Un espace pour vos meilleurs noms.",
    brandDescription: "Trouvez, comparez et développez votre prochaine idée.",
    discover: "Découvrez", compare: "Comparez", save: "Enregistrez",
    oneAccount: "Un compte Sajda. Les mêmes identifiants pour toutes les offres.",
    showPassword: "Afficher le mot de passe", hidePassword: "Masquer le mot de passe",
    showConfirmation: "Afficher la confirmation du mot de passe", hideConfirmation: "Masquer la confirmation du mot de passe",
    legalLead: "Consultez nos", terms: "Conditions d’utilisation", and: "et notre", privacy: "Politique de confidentialité", end: ".",
  },
  zh: {
    brandHeading: "让好名字有个归属。",
    brandDescription: "发现、比较，让下一个创意成形。",
    discover: "发现", compare: "比较", save: "收藏",
    oneAccount: "一个 Sajda 账户，所有方案使用同一登录方式。",
    showPassword: "显示密码", hidePassword: "隐藏密码",
    showConfirmation: "显示确认密码", hideConfirmation: "隐藏确认密码",
    legalLead: "请阅读我们的", terms: "服务条款", and: "和", privacy: "隐私政策", end: "。",
  },
} satisfies Record<Language, Record<string, string>>;

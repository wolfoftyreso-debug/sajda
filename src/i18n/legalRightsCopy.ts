import type { Language } from "./languagePreference";

type LegalRightsCopy = {
  title: string;
  rights: string;
  request: string;
  complaint: string;
  requestAction: string;
  complaintAction: string;
  termsLink: string;
  privacyLink: string;
  contactLink: string;
};

/** General rights guidance, not a claim that the release's complete privacy
 * notice or vendor/retention review has been approved. GDPR Articles 12–22, 77. */
export const legalRightsCopy: Record<Language, LegalRightsCopy> = {
  en: {
    title: "Your privacy rights",
    rights: "Where the GDPR applies, you can request access to your personal data, correction, deletion or restriction, and object to certain uses. Data portability applies where its legal conditions are met. Where processing relies on consent, you can withdraw it for future processing; this does not make earlier lawful processing unlawful.",
    request: "Contact dev@hypbit.com to exercise your rights, including if you cannot sign in. Describe your request, but do not send passwords, recovery codes, API keys or identity documents in your first message. We may need proportionate information to confirm your identity before releasing or changing personal data.",
    complaint: "You can complain to a data protection authority, including Sweden’s IMY or the authority where you live or work in the EU/EEA. Contacting Sajda first is not a condition for this right.",
    requestAction: "Email a privacy request",
    complaintAction: "How to complain to IMY",
    termsLink: "Product terms", privacyLink: "Privacy", contactLink: "Contact and support",
  },
  sv: {
    title: "Dina dataskyddsrättigheter",
    rights: "När GDPR gäller kan du begära tillgång till dina personuppgifter, rättelse, radering eller begränsning och invända mot viss behandling. Dataportabilitet gäller när lagens villkor är uppfyllda. När behandlingen bygger på samtycke kan du återkalla det för framtida behandling; det påverkar inte lagligheten av tidigare behandling.",
    request: "Kontakta dev@hypbit.com för att utöva dina rättigheter, även om du inte kan logga in. Beskriv ditt ärende, men skicka inte lösenord, återställningskoder, API-nycklar eller identitetshandlingar i det första meddelandet. Vi kan behöva proportionerliga uppgifter för att bekräfta din identitet innan personuppgifter lämnas ut eller ändras.",
    complaint: "Du kan klaga hos en dataskyddsmyndighet, exempelvis svenska IMY eller myndigheten där du bor eller arbetar inom EU/EES. Du behöver inte kontakta Sajda först för att använda den rättigheten.",
    requestAction: "Mejla en dataskyddsbegäran",
    complaintAction: "Så lämnar du klagomål till IMY",
    termsLink: "Produktvillkor", privacyLink: "Integritet", contactLink: "Kontakt och support",
  },
  es: {
    title: "Tus derechos de protección de datos",
    rights: "Cuando se aplica el RGPD, puedes solicitar acceso a tus datos personales, su rectificación, supresión o limitación y oponerte a determinados usos. La portabilidad se aplica cuando se cumplen sus condiciones legales. Si el tratamiento se basa en el consentimiento, puedes retirarlo para usos futuros; esto no afecta a la licitud del tratamiento anterior.",
    request: "Contacta con dev@hypbit.com para ejercer tus derechos, aunque no puedas iniciar sesión. Describe tu solicitud, pero no envíes contraseñas, códigos de recuperación, claves API ni documentos de identidad en el primer mensaje. Podemos necesitar información proporcionada para confirmar tu identidad antes de entregar o modificar datos personales.",
    complaint: "Puedes reclamar ante una autoridad de protección de datos, como la IMY sueca o la autoridad del lugar donde vives o trabajas en la UE/EEE. No es obligatorio contactar primero con Sajda.",
    requestAction: "Enviar una solicitud de privacidad",
    complaintAction: "Cómo reclamar ante IMY",
    termsLink: "Condiciones del producto", privacyLink: "Privacidad", contactLink: "Contacto y asistencia",
  },
  fr: {
    title: "Vos droits en matière de données personnelles",
    rights: "Lorsque le RGPD s’applique, vous pouvez demander l’accès à vos données personnelles, leur rectification, leur effacement ou la limitation du traitement, et vous opposer à certains usages. La portabilité s’applique lorsque ses conditions légales sont réunies. Si le traitement repose sur votre consentement, vous pouvez le retirer pour l’avenir, sans rendre illicite un traitement antérieur licite.",
    request: "Contactez dev@hypbit.com pour exercer vos droits, même sans pouvoir vous connecter. Décrivez votre demande, sans envoyer de mot de passe, code de récupération, clé API ni pièce d’identité dans le premier message. Nous pouvons avoir besoin d’informations proportionnées pour confirmer votre identité avant de communiquer ou modifier des données personnelles.",
    complaint: "Vous pouvez saisir une autorité de protection des données, notamment l’IMY suédoise ou celle de votre lieu de résidence ou de travail dans l’UE/EEE. Il n’est pas obligatoire de contacter Sajda au préalable.",
    requestAction: "Envoyer une demande de confidentialité",
    complaintAction: "Déposer une réclamation auprès d’IMY",
    termsLink: "Conditions du produit", privacyLink: "Confidentialité", contactLink: "Contact et assistance",
  },
  zh: {
    title: "您的数据保护权利",
    rights: "在 GDPR 适用时，您可以请求访问、更正、删除或限制处理您的个人数据，并反对某些用途。在符合法律条件时，您还享有数据可携带权。如果处理依据是您的同意，您可以撤回同意以停止未来的相关处理；这不会影响此前合法处理的合法性。",
    request: "即使无法登录，您也可联系 dev@hypbit.com 行使权利。请说明请求，但不要在第一封邮件中发送密码、恢复码、API 密钥或身份证件。在提供或修改个人数据前，我们可能需要适当的信息来确认您的身份。",
    complaint: "您可以向数据保护机构投诉，例如瑞典 IMY，或您在欧盟／欧洲经济区居住或工作所在地的主管机构。行使此权利不以先联系 Sajda 为条件。",
    requestAction: "通过邮件提出隐私请求",
    complaintAction: "如何向 IMY 投诉",
    termsLink: "产品条款", privacyLink: "隐私", contactLink: "联系与支持",
  },
};

export const IMY_COMPLAINT_URL = "https://www.imy.se/privatperson/utfora-arenden/lamna-ett-klagomal/";

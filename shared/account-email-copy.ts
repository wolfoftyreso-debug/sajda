/** English is the source copy. Locale selection changes wording, never account state. */
export type EmailLanguage = "en" | "sv" | "es" | "fr" | "zh";
type MessageCopy = { subject: string; heading: string; introduction: string; action: string; notice: string };
type EmailCopy = { verify: MessageCopy; reset: MessageCopy; safety: string; fallback: string; footer: string };

export function emailLanguage(value: unknown): EmailLanguage {
  return value === "sv" || value === "es" || value === "fr" || value === "zh" ? value : "en";
}

export const accountEmailCopy: Record<EmailLanguage, EmailCopy> = {
  en: {
    verify: {
      subject: "Confirm your email address – Sajda", heading: "Confirm your email address",
      introduction: "Confirm your email address to start saving domains to your Sajda account.",
      action: "Confirm email address", notice: "If you didn’t create a Sajda account, you can ignore this email.",
    },
    reset: {
      subject: "Reset your password – Sajda", heading: "Choose a new password",
      introduction: "We received a request to reset your Sajda password. Follow the link to choose a new one.",
      action: "Choose new password", notice: "If you didn’t request a password reset, you can ignore this email. Your password won’t change until you choose a new one.",
    },
    safety: "This link is private and expires after a limited time. Don’t share it with anyone.",
    fallback: "Button not working? Copy this link into your browser:",
    footer: "Sajda · Find, compare, and save domains",
  },
  sv: {
    verify: {
      subject: "Bekräfta din e-postadress – Sajda", heading: "Bekräfta din e-postadress",
      introduction: "Bekräfta din e-postadress för att börja spara domäner på ditt Sajda-konto.",
      action: "Bekräfta e-postadress", notice: "Om du inte har skapat ett Sajda-konto kan du bortse från det här mejlet.",
    },
    reset: {
      subject: "Återställ ditt lösenord – Sajda", heading: "Välj ett nytt lösenord",
      introduction: "Vi har fått en begäran om att återställa lösenordet till ditt Sajda-konto. Följ länken för att välja ett nytt lösenord.",
      action: "Välj nytt lösenord", notice: "Om du inte har begärt ett nytt lösenord kan du bortse från det här mejlet. Lösenordet ändras inte förrän du väljer ett nytt.",
    },
    safety: "Länken är personlig och gäller en begränsad tid. Dela den inte med någon.",
    fallback: "Fungerar inte knappen? Kopiera den här länken till webbläsaren:",
    footer: "Sajda · Sök, jämför och spara domäner",
  },
  es: {
    verify: {
      subject: "Confirma tu correo electrónico – Sajda", heading: "Confirma tu correo electrónico",
      introduction: "Confirma tu correo electrónico para empezar a guardar dominios en tu cuenta de Sajda.",
      action: "Confirmar correo electrónico", notice: "Si no has creado una cuenta de Sajda, puedes ignorar este mensaje.",
    },
    reset: {
      subject: "Restablece tu contraseña – Sajda", heading: "Elige una nueva contraseña",
      introduction: "Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de Sajda. Sigue el enlace para elegir una nueva.",
      action: "Elegir nueva contraseña", notice: "Si no has solicitado restablecer tu contraseña, puedes ignorar este mensaje. Tu contraseña no cambiará hasta que elijas una nueva.",
    },
    safety: "Este enlace es personal y tiene una validez limitada. No lo compartas con nadie.",
    fallback: "¿No funciona el botón? Copia este enlace en tu navegador:",
    footer: "Sajda · Encuentra, compara y guarda dominios",
  },
  fr: {
    verify: {
      subject: "Confirmez votre adresse e-mail – Sajda", heading: "Confirmez votre adresse e-mail",
      introduction: "Confirmez votre adresse e-mail pour commencer à enregistrer des domaines dans votre compte Sajda.",
      action: "Confirmer mon adresse e-mail", notice: "Si vous n’avez pas créé de compte Sajda, vous pouvez ignorer cet e-mail.",
    },
    reset: {
      subject: "Réinitialisez votre mot de passe – Sajda", heading: "Choisissez un nouveau mot de passe",
      introduction: "Nous avons reçu une demande de réinitialisation du mot de passe de votre compte Sajda. Suivez le lien pour en choisir un nouveau.",
      action: "Choisir un nouveau mot de passe", notice: "Si vous n’avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail. Votre mot de passe ne changera pas tant que vous n’en aurez pas choisi un nouveau.",
    },
    safety: "Ce lien est personnel et sa durée de validité est limitée. Ne le partagez avec personne.",
    fallback: "Le bouton ne fonctionne pas ? Copiez ce lien dans votre navigateur :",
    footer: "Sajda · Trouvez, comparez et enregistrez des domaines",
  },
  zh: {
    verify: {
      subject: "确认你的电子邮箱 – Sajda", heading: "确认你的电子邮箱",
      introduction: "确认电子邮箱后，即可开始将域名保存到你的 Sajda 账户。",
      action: "确认电子邮箱", notice: "如果你没有注册 Sajda 账户，请忽略此邮件。",
    },
    reset: {
      subject: "重置你的密码 – Sajda", heading: "设置新密码",
      introduction: "我们收到了重置你的 Sajda 账户密码的请求。请点击链接设置新密码。",
      action: "设置新密码", notice: "如果你没有请求重置密码，请忽略此邮件。在你设置新密码之前，原密码不会改变。",
    },
    safety: "此链接仅供你本人使用，且会在一定时间后失效。请勿与他人分享。",
    fallback: "按钮无法打开？请将以下链接复制到浏览器中：",
    footer: "Sajda · 搜索、比较并保存域名",
  },
};

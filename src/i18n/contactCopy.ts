import type { Language } from "./LanguageProvider";
import type { ContactErrorCode } from "../lib/contact";

type ContactCopy = {
  title: string; back: string; lead: string; name: string; email: string; subject: string; message: string;
  nameError: string; emailError: string; subjectError: string; messageError: string;
  messageHint: string; privacy: string; privacyLink: string; submit: string; sending: string;
  acceptedTitle: string; acceptedBody: string; another: string; reference: string;
  fallback: string; fallbackHint: string; resetHint: string; resetLink: string;
  validation: string; unavailable: string; unconfirmed: string; busy: string; rateLimited: string;
  conflict: string; expired: string; origin: string; wait: (seconds: number) => string;
};

export const contactCopy: Record<Language, ContactCopy> = {
  sv: {
    title: "Kontakta Sajda", back: "Tillbaka till sökningen",
    lead: "Har du en fråga, hittat ett fel eller vill lämna ett förslag? Skriv till vårt team. Du behöver inget konto.",
    name: "Ditt namn", email: "Din e-postadress", subject: "Vad gäller det?", message: "Meddelande",
    nameError: "Ange ett namn med 2–80 tecken.", emailError: "Ange en giltig e-postadress med vanliga latinska tecken.",
    subjectError: "Skriv en rubrik med 3–120 tecken på en rad.", messageError: "Skriv ett meddelande med 20–5 000 tecken.",
    messageHint: "20–5 000 tecken. Beskriv gärna vad du försökte göra och vad som hände.",
    privacy: "Ditt namn, din e-postadress och ditt meddelande skickas via Resend till vårt team på dev@hypbit.com för att hantera ditt ärende. Skicka inte lösenord, återställningslänkar, betalningsuppgifter, API-nycklar eller andra känsliga uppgifter.",
    privacyLink: "Läs om integritet", submit: "Skicka meddelande", sending: "Skickar meddelandet…",
    acceptedTitle: "Meddelandet är lämnat för leverans",
    acceptedBody: "E-posttjänsten har accepterat ditt meddelande till vårt team. Det bekräftar inte att det nått inkorgen ännu. Ett eventuellt svar skickas till adressen du angav.",
    another: "Skriv ett nytt meddelande", reference: "Referens", fallback: "Mejla oss direkt",
    fallbackHint: "Du kan också använda din e-postapp. Formulärets text följer inte med automatiskt.",
    resetHint: "Behöver du återställa ditt lösenord? Använd återställningen så skickas länken till din egen e-postadress.", resetLink: "Återställ lösenord",
    validation: "Kontrollera fälten innan du skickar. Meddelandet har inte accepterats.",
    unavailable: "Kontaktformuläret är inte tillgängligt just nu. Texten finns kvar. Försök igen senare eller mejla oss direkt.",
    unconfirmed: "Vi kunde inte bekräfta att meddelandet accepterades. Texten finns kvar. Försök igen utan att ändra formuläret för ett säkert återförsök.",
    busy: "Ditt meddelande behandlas redan. Texten finns kvar. Vänta en stund och försök sedan igen utan att ändra formuläret.",
    rateLimited: "För många försök på kort tid. Texten finns kvar. Vänta innan du försöker igen.",
    conflict: "Det här meddelandets referens har redan använts med annat innehåll. Texten finns kvar; mejla oss direkt om problemet fortsätter.",
    expired: "Meddelandet kan inte längre skickas om automatiskt. Texten finns kvar. Kontakta dev@hypbit.com innan du skickar det igen, så att vi kan undvika dubbletter.",
    origin: "Meddelandet kunde inte skickas från den här sidan. Texten finns kvar. Öppna Sajda direkt i webbläsaren eller mejla oss.",
    wait: seconds => `Försök tidigast igen om ${seconds} sekunder.`,
  },
  en: {
    title: "Contact Sajda", back: "Back to search",
    lead: "Have a question, found a problem, or want to suggest an improvement? Write to our team. No account needed.",
    name: "Your name", email: "Your email address", subject: "What is it about?", message: "Message",
    nameError: "Enter a name with 2–80 characters.", emailError: "Enter a valid email address using standard Latin characters.",
    subjectError: "Enter a single-line subject with 3–120 characters.", messageError: "Write a message with 20–5,000 characters.",
    messageHint: "20–5,000 characters. Tell us what you tried and what happened.",
    privacy: "Your name, email address and message are sent through Resend to our team at dev@hypbit.com to handle your request. Do not include passwords, recovery links, payment details, API keys or other sensitive information.",
    privacyLink: "Read about privacy", submit: "Send message", sending: "Sending your message…",
    acceptedTitle: "Message submitted for delivery",
    acceptedBody: "The email service accepted your message to our team. This does not yet confirm inbox delivery. Any reply will go to the address you provided.",
    another: "Write another message", reference: "Reference", fallback: "Email us directly",
    fallbackHint: "You can also use your email app. Your form text is not copied automatically.",
    resetHint: "Need to reset your password? Use password recovery to send a link to your own email address.", resetLink: "Reset password",
    validation: "Check the fields before sending. Your message was not accepted.",
    unavailable: "The contact form is unavailable right now. Your text is still here. Try later or email us directly.",
    unconfirmed: "We could not confirm that your message was accepted. Your text is still here. Retry without changing the form to safely repeat the same request.",
    busy: "Your message is already being processed. Your text is still here. Wait a moment, then retry without changing the form.",
    rateLimited: "Too many attempts in a short time. Your text is still here. Wait before trying again.",
    conflict: "This message reference was already used for different content. Your text is still here; email us directly if this continues.",
    expired: "This message can no longer be retried automatically. Your text is still here. Contact dev@hypbit.com before sending it again so we can avoid duplicates.",
    origin: "The message could not be sent from this page. Your text is still here. Open Sajda directly in your browser or email us.",
    wait: seconds => `Try again in at least ${seconds} seconds.`,
  },
  es: {
    title: "Contacta con Sajda", back: "Volver a la búsqueda",
    lead: "¿Tienes una pregunta, has encontrado un error o quieres proponer una mejora? Escribe a nuestro equipo. No necesitas una cuenta.",
    name: "Tu nombre", email: "Tu correo electrónico", subject: "¿De qué se trata?", message: "Mensaje",
    nameError: "Introduce un nombre de 2–80 caracteres.", emailError: "Introduce un correo válido con caracteres latinos estándar.",
    subjectError: "Escribe un asunto de 3–120 caracteres en una sola línea.", messageError: "Escribe un mensaje de 20–5.000 caracteres.",
    messageHint: "20–5.000 caracteres. Cuéntanos qué intentaste y qué ocurrió.",
    privacy: "Tu nombre, correo y mensaje se envían mediante Resend a nuestro equipo en dev@hypbit.com para atender tu consulta. No incluyas contraseñas, enlaces de recuperación, datos de pago, claves API ni información sensible.",
    privacyLink: "Información sobre privacidad", submit: "Enviar mensaje", sending: "Enviando el mensaje…",
    acceptedTitle: "Mensaje enviado al servicio de correo",
    acceptedBody: "El servicio de correo ha aceptado tu mensaje para nuestro equipo. Esto aún no confirma su llegada a la bandeja de entrada. Cualquier respuesta se enviará al correo que indicaste.",
    another: "Escribir otro mensaje", reference: "Referencia", fallback: "Escríbenos directamente",
    fallbackHint: "También puedes usar tu aplicación de correo. El texto del formulario no se copia automáticamente.",
    resetHint: "¿Necesitas restablecer tu contraseña? Usa la recuperación para recibir un enlace en tu propio correo.", resetLink: "Restablecer contraseña",
    validation: "Revisa los campos antes de enviar. El mensaje no ha sido aceptado.",
    unavailable: "El formulario no está disponible ahora. El texto sigue aquí. Inténtalo más tarde o escríbenos directamente.",
    unconfirmed: "No pudimos confirmar que el mensaje fuera aceptado. El texto sigue aquí. Reintenta sin modificar el formulario para repetir la misma solicitud de forma segura.",
    busy: "El mensaje ya se está procesando. El texto sigue aquí. Espera y reintenta sin modificar el formulario.",
    rateLimited: "Demasiados intentos en poco tiempo. El texto sigue aquí. Espera antes de reintentar.",
    conflict: "La referencia del mensaje ya se utilizó con otro contenido. El texto sigue aquí; escríbenos directamente si el problema continúa.",
    expired: "Este mensaje ya no se puede reintentar automáticamente. El texto sigue aquí. Contacta con dev@hypbit.com antes de volver a enviarlo para evitar duplicados.",
    origin: "No se pudo enviar desde esta página. El texto sigue aquí. Abre Sajda directamente en el navegador o escríbenos.",
    wait: seconds => `Espera al menos ${seconds} segundos antes de reintentar.`,
  },
  fr: {
    title: "Contacter Sajda", back: "Retour à la recherche",
    lead: "Une question, un problème ou une suggestion ? Écrivez à notre équipe. Aucun compte n’est nécessaire.",
    name: "Votre nom", email: "Votre adresse e-mail", subject: "Quel est le sujet ?", message: "Message",
    nameError: "Saisissez un nom de 2–80 caractères.", emailError: "Saisissez une adresse e-mail valide avec des caractères latins standard.",
    subjectError: "Saisissez un objet de 3–120 caractères sur une seule ligne.", messageError: "Rédigez un message de 20–5 000 caractères.",
    messageHint: "20–5 000 caractères. Décrivez ce que vous avez essayé et ce qui s’est passé.",
    privacy: "Votre nom, votre adresse e-mail et votre message sont envoyés via Resend à notre équipe à dev@hypbit.com pour traiter votre demande. N’incluez aucun mot de passe, lien de récupération, détail de paiement, clé API ou renseignement sensible.",
    privacyLink: "Lire la politique de confidentialité", submit: "Envoyer le message", sending: "Envoi du message…",
    acceptedTitle: "Message transmis pour livraison",
    acceptedBody: "Le service e-mail a accepté votre message pour notre équipe. Cela ne confirme pas encore son arrivée dans la boîte de réception. Toute réponse sera envoyée à l’adresse indiquée.",
    another: "Écrire un autre message", reference: "Référence", fallback: "Nous écrire directement",
    fallbackHint: "Vous pouvez aussi utiliser votre application e-mail. Le texte du formulaire n’est pas copié automatiquement.",
    resetHint: "Besoin de réinitialiser votre mot de passe ? Utilisez la récupération pour recevoir un lien à votre propre adresse e-mail.", resetLink: "Réinitialiser le mot de passe",
    validation: "Vérifiez les champs avant l’envoi. Le message n’a pas été accepté.",
    unavailable: "Le formulaire est indisponible pour le moment. Votre texte est conservé ici. Réessayez plus tard ou écrivez-nous directement.",
    unconfirmed: "Nous n’avons pas pu confirmer l’acceptation du message. Votre texte est conservé ici. Réessayez sans modifier le formulaire pour répéter la même demande en sécurité.",
    busy: "Le message est déjà en cours de traitement. Votre texte est conservé ici. Patientez puis réessayez sans modifier le formulaire.",
    rateLimited: "Trop de tentatives rapprochées. Votre texte est conservé ici. Patientez avant de réessayer.",
    conflict: "Cette référence a déjà été utilisée avec un autre contenu. Votre texte est conservé ici ; écrivez-nous directement si le problème persiste.",
    expired: "Ce message ne peut plus être réessayé automatiquement. Votre texte est conservé ici. Contactez dev@hypbit.com avant de le renvoyer pour éviter les doublons.",
    origin: "L’envoi a échoué depuis cette page. Votre texte est conservé ici. Ouvrez Sajda directement dans votre navigateur ou écrivez-nous.",
    wait: seconds => `Réessayez dans au moins ${seconds} secondes.`,
  },
  zh: {
    title: "联系 Sajda", back: "返回搜索",
    lead: "有问题、发现故障或想提出建议？请联系团队，无需账号。",
    name: "你的姓名", email: "你的电子邮箱", subject: "主题", message: "留言",
    nameError: "请输入 2–80 个字符的姓名。", emailError: "请输入使用标准拉丁字符的有效邮箱地址。",
    subjectError: "请输入 3–120 个字符的单行主题。", messageError: "请输入 20–5,000 个字符的留言。",
    messageHint: "20–5,000 个字符。请描述你的操作和遇到的情况。",
    privacy: "你的姓名、邮箱和留言将通过 Resend 发送至团队邮箱 dev@hypbit.com，以处理你的咨询。请勿包含密码、恢复链接、支付信息、API 密钥或其他敏感信息。",
    privacyLink: "了解隐私信息", submit: "发送留言", sending: "正在发送留言…",
    acceptedTitle: "留言已提交至邮件服务",
    acceptedBody: "邮件服务已接受发送给团队的留言，但尚不能确认已送达收件箱。回复将发送至你填写的邮箱。",
    another: "再写一条留言", reference: "参考编号", fallback: "直接发邮件给我们",
    fallbackHint: "你也可以使用邮件应用。表单内容不会自动复制。",
    resetHint: "需要重设密码？请使用密码恢复功能，将链接发送至你自己的邮箱。", resetLink: "重设密码",
    validation: "请检查各项内容后再发送。留言尚未被接受。",
    unavailable: "联系表单暂时不可用。内容仍保留在这里，请稍后重试或直接发送邮件。",
    unconfirmed: "无法确认留言是否已被接受。内容仍保留在这里。请勿修改表单，直接重试以安全地重复同一请求。",
    busy: "留言正在处理中。内容仍保留在这里。请稍后在不修改表单的情况下重试。",
    rateLimited: "短时间内尝试次数过多。内容仍保留在这里，请稍后重试。",
    conflict: "该参考编号已用于其他内容。内容仍保留在这里；如问题持续，请直接发送邮件。",
    expired: "此留言已无法自动重试，内容仍保留在这里。再次发送前请联系 dev@hypbit.com，以避免重复。",
    origin: "无法从此页面发送。内容仍保留在这里，请在浏览器中直接打开 Sajda 或发送邮件。",
    wait: seconds => `请至少等待 ${seconds} 秒后重试。`,
  },
};

export function contactErrorMessage(code: ContactErrorCode, language: Language): string {
  const copy = contactCopy[language];
  switch (code) {
    case "invalid_request": case "request_too_large": case "unsupported_media_type": return copy.validation;
    case "contact_unavailable": return copy.unavailable;
    case "submission_in_progress": return copy.busy;
    case "submission_conflict": return copy.conflict;
    case "submission_expired": return copy.expired;
    case "rate_limited": return copy.rateLimited;
    case "forbidden_origin": return copy.origin;
    default: return copy.unconfirmed;
  }
}

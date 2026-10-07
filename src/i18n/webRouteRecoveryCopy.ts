import type { Language } from "./languagePreference";

const en = {
  title: "This page could not be displayed",
  body: "An action in progress may already have completed. Check its result before submitting it again. This screen cannot confirm whether your changes were saved.",
  warning: "Reloading or leaving this page may discard edits you have not saved.",
  search: "Back to search", reload: "Reload page", reloading: "Reloading…", account: "Check your account",
  support: "Contact support", supportHint: "If you contact us, describe what you were trying to do. Do not send passwords, recovery links or API keys.",
  reloadFailed: "Your browser did not reload the page. Try opening Sajda in a new tab, or contact support.",
  reference: "Browser reference", referenceHint: "This identifies the page error in this browser, not a server request.",
};

export const webRouteRecoveryCopy: Record<Language, typeof en> = {
  en,
  sv: {
    title: "Sidan kunde inte visas",
    body: "En pågående åtgärd kan redan ha genomförts. Kontrollera resultatet innan du skickar samma begäran igen. Den här sidan kan inte bekräfta om dina ändringar sparades.",
    warning: "Om du laddar om eller lämnar sidan kan ändringar som du inte har sparat gå förlorade.",
    search: "Tillbaka till sökningen", reload: "Ladda om sidan", reloading: "Laddar om…", account: "Kontrollera ditt konto",
    support: "Kontakta support", supportHint: "Beskriv vad du försökte göra om du kontaktar oss. Skicka inte lösenord, återställningslänkar eller API-nycklar.",
    reloadFailed: "Webbläsaren laddade inte om sidan. Prova att öppna Sajda i en ny flik eller kontakta supporten.",
    reference: "Webbläsarreferens", referenceHint: "Identifierar sidfelet i den här webbläsaren, inte ett serveranrop.",
  },
  es: {
    title: "No se pudo mostrar esta página",
    body: "Una operación en curso podría haberse completado. Comprueba su resultado antes de enviarla de nuevo. Esta pantalla no puede confirmar si se guardaron tus cambios.",
    warning: "Al recargar o salir de esta página, podrías perder los cambios que no hayas guardado.",
    search: "Volver a la búsqueda", reload: "Recargar página", reloading: "Recargando…", account: "Revisar tu cuenta",
    support: "Contactar con soporte", supportHint: "Si nos contactas, describe lo que intentabas hacer. No envíes contraseñas, enlaces de recuperación ni claves API.",
    reloadFailed: "El navegador no recargó la página. Prueba a abrir Sajda en una pestaña nueva o contacta con soporte.",
    reference: "Referencia del navegador", referenceHint: "Identifica el error de página en este navegador, no una solicitud al servidor.",
  },
  fr: {
    title: "Cette page n’a pas pu être affichée",
    body: "Une opération en cours peut déjà avoir abouti. Vérifiez son résultat avant de la soumettre à nouveau. Cet écran ne peut pas confirmer si vos modifications ont été enregistrées.",
    warning: "Recharger ou quitter cette page peut vous faire perdre les modifications non enregistrées.",
    search: "Revenir à la recherche", reload: "Recharger la page", reloading: "Rechargement…", account: "Vérifier votre compte",
    support: "Contacter l’assistance", supportHint: "Si vous nous contactez, décrivez ce que vous tentiez de faire. N’envoyez ni mot de passe, ni lien de récupération, ni clé API.",
    reloadFailed: "Votre navigateur n’a pas rechargé la page. Essayez d’ouvrir Sajda dans un nouvel onglet ou contactez l’assistance.",
    reference: "Référence du navigateur", referenceHint: "Identifie l’erreur de page dans ce navigateur, pas une requête au serveur.",
  },
  zh: {
    title: "无法显示此页面",
    body: "正在进行的操作可能已经完成。再次提交前，请先检查结果。此页面无法确认你的更改是否已保存。",
    warning: "重新加载或离开此页面可能会丢失尚未保存的编辑。",
    search: "返回搜索", reload: "重新加载页面", reloading: "正在重新加载…", account: "检查你的账户",
    support: "联系支持", supportHint: "联系我们时，请说明你正在进行的操作。请勿发送密码、恢复链接或 API 密钥。",
    reloadFailed: "浏览器未能重新加载页面。请尝试在新标签页中打开 Sajda，或联系支持团队。",
    reference: "浏览器参考编号", referenceHint: "此编号标识当前浏览器中的页面错误，不是服务器请求编号。",
  },
};

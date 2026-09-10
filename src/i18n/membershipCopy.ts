import type { PlanId } from "../../shared/plans";

type MembershipCopy = {
  account: string; home: string; lead: string; currentPlan: string;
  loading: string; unavailable: string; unavailableDetail: string; retry: string; refresh: string;
  verificationTitle: string; verificationDetail: string;
  freeAccess: string; assignedAccess: string; subscriptionAccess: string; expires: string;
  currentFeatures: string; search: string; swipe: string; saved: string; undo: string;
  trading: string; comparePlans: string; sameAccount: string; requestReference: string;
  planNames: Record<PlanId, string>;
};

const en: MembershipCopy = {
  account: "Your Sajda account", home: "Back to search",
  lead: "One account for search, saved domains, Swipe and Trading. Your access level changes, not your login.",
  currentPlan: "Current access level", loading: "Checking your access…",
  unavailable: "Your access could not be confirmed", unavailableDetail: "Your account is still signed in. Retry to see your current level and available features.",
  verificationTitle: "Confirm your email to access account features", verificationDetail: "Open the confirmation link in your inbox, then check access again. You do not need another account for Trading.",
  retry: "Check access again", refresh: "Refresh access", freeAccess: "Free access. No paid subscription.",
  assignedAccess: "Access assigned by Sajda, not a paid subscription. This grant does not renew or charge you.",
  subscriptionAccess: "Access from your subscription.", expires: "Access valid until",
  currentFeatures: "Available on this account", search: "Search domains", swipe: "Open Swipe", saved: "Saved domains",
  undo: "Undo your last swipe", trading: "Open Trading", comparePlans: "Compare access levels",
  sameAccount: "Use this same account at every level. Your saved domains stay with your account.",
  requestReference: "Support reference", planNames: { free: "Free", basic: "Basic", premium: "Premium", trading: "Trading" },
};

const sv: MembershipCopy = {
  account: "Ditt Sajda-konto", home: "Tillbaka till sökningen",
  lead: "Ett konto för sökning, sparade domäner, Swipe och Trading. Din åtkomstnivå ändras, inte din inloggning.",
  currentPlan: "Din aktuella åtkomstnivå", loading: "Kontrollerar din åtkomst…",
  unavailable: "Din åtkomst kunde inte bekräftas", unavailableDetail: "Du är fortfarande inloggad. Försök igen för att se din aktuella nivå och tillgängliga funktioner.",
  verificationTitle: "Bekräfta din e-post för att använda kontofunktionerna", verificationDetail: "Öppna bekräftelselänken i din inkorg och kontrollera sedan åtkomsten igen. Du behöver inte ett annat konto för Trading.",
  retry: "Kontrollera åtkomsten igen", refresh: "Uppdatera åtkomst", freeAccess: "Gratis åtkomst. Inget betalt abonnemang.",
  assignedAccess: "Åtkomst tilldelad av Sajda, inte ett betalt abonnemang. Den förnyas inte och medför ingen debitering.",
  subscriptionAccess: "Åtkomst via ditt abonnemang.", expires: "Åtkomsten gäller till",
  currentFeatures: "Tillgängligt på ditt konto", search: "Sök domäner", swipe: "Öppna Swipe", saved: "Sparade domäner",
  undo: "Ångra din senaste svajp", trading: "Öppna Trading", comparePlans: "Jämför åtkomstnivåer",
  sameAccount: "Använd samma konto på alla nivåer. Dina sparade domäner stannar på ditt konto.",
  requestReference: "Supportreferens", planNames: { free: "Gratis", basic: "Bas", premium: "Premium", trading: "Trading" },
};

const es: MembershipCopy = {
  account: "Tu cuenta de Sajda", home: "Volver a la búsqueda",
  lead: "Una cuenta para buscar, guardar dominios, usar Swipe y Trading. Cambia tu nivel de acceso, no tu inicio de sesión.",
  currentPlan: "Nivel de acceso actual", loading: "Comprobando tu acceso…",
  unavailable: "No se pudo confirmar tu acceso", unavailableDetail: "Tu sesión sigue abierta. Reintenta para ver tu nivel y las funciones disponibles.",
  verificationTitle: "Confirma tu correo para acceder a las funciones de la cuenta", verificationDetail: "Abre el enlace de confirmación en tu correo y vuelve a comprobar el acceso. No necesitas otra cuenta para Trading.",
  retry: "Comprobar el acceso de nuevo", refresh: "Actualizar acceso", freeAccess: "Acceso gratuito. Sin suscripción de pago.",
  assignedAccess: "Acceso asignado por Sajda, no una suscripción de pago. No se renueva ni genera cargos.",
  subscriptionAccess: "Acceso mediante tu suscripción.", expires: "Acceso válido hasta",
  currentFeatures: "Disponible en tu cuenta", search: "Buscar dominios", swipe: "Abrir Swipe", saved: "Dominios guardados",
  undo: "Deshacer el último deslizamiento", trading: "Abrir Trading", comparePlans: "Comparar niveles de acceso",
  sameAccount: "Usa la misma cuenta en todos los niveles. Tus dominios guardados permanecen en tu cuenta.",
  requestReference: "Referencia para soporte", planNames: { free: "Gratis", basic: "Básico", premium: "Premium", trading: "Trading" },
};

const fr: MembershipCopy = {
  account: "Votre compte Sajda", home: "Retour à la recherche",
  lead: "Un compte pour rechercher, enregistrer des domaines, utiliser Swipe et Trading. Votre niveau d’accès change, pas votre connexion.",
  currentPlan: "Niveau d’accès actuel", loading: "Vérification de votre accès…",
  unavailable: "Votre accès n’a pas pu être confirmé", unavailableDetail: "Vous êtes toujours connecté. Réessayez pour voir votre niveau et les fonctions disponibles.",
  verificationTitle: "Confirmez votre e-mail pour accéder aux fonctions du compte", verificationDetail: "Ouvrez le lien de confirmation dans votre boîte mail, puis vérifiez à nouveau l’accès. Trading ne nécessite pas un autre compte.",
  retry: "Vérifier à nouveau l’accès", refresh: "Actualiser l’accès", freeAccess: "Accès gratuit. Aucun abonnement payant.",
  assignedAccess: "Accès attribué par Sajda, et non un abonnement payant. Il ne se renouvelle pas et ne vous est pas facturé.",
  subscriptionAccess: "Accès via votre abonnement.", expires: "Accès valable jusqu’au",
  currentFeatures: "Disponible sur votre compte", search: "Rechercher des domaines", swipe: "Ouvrir Swipe", saved: "Domaines enregistrés",
  undo: "Annuler le dernier balayage", trading: "Ouvrir Trading", comparePlans: "Comparer les niveaux d’accès",
  sameAccount: "Utilisez le même compte à tous les niveaux. Vos domaines enregistrés restent sur votre compte.",
  requestReference: "Référence pour l’assistance", planNames: { free: "Gratuit", basic: "Basique", premium: "Premium", trading: "Trading" },
};

const zh: MembershipCopy = {
  account: "你的 Sajda 账户", home: "返回搜索",
  lead: "搜索、已保存域名、Swipe 和 Trading 共用一个账户。改变的是访问级别，而不是登录账户。",
  currentPlan: "当前访问级别", loading: "正在检查访问权限…",
  unavailable: "无法确认你的访问权限", unavailableDetail: "你仍处于登录状态。请重试以查看当前级别和可用功能。",
  verificationTitle: "请确认电子邮箱以使用账户功能", verificationDetail: "打开收件箱中的确认链接，然后重新检查访问权限。Trading 无需另建账户。",
  retry: "重新检查访问权限", refresh: "刷新访问权限", freeAccess: "免费访问，没有付费订阅。",
  assignedAccess: "这是 Sajda 授予的访问权限，不是付费订阅。不会自动续期或扣费。",
  subscriptionAccess: "通过订阅获得访问权限。", expires: "访问权限有效至",
  currentFeatures: "此账户的可用功能", search: "搜索域名", swipe: "打开 Swipe", saved: "已保存域名",
  undo: "撤销上一次滑动", trading: "打开 Trading", comparePlans: "比较访问级别",
  sameAccount: "所有级别使用同一个账户。已保存域名始终保留在你的账户中。",
  requestReference: "支持参考编号", planNames: { free: "免费", basic: "基础", premium: "Premium", trading: "Trading" },
};

export function getMembershipCopy(language: string): MembershipCopy {
  return ({ en, sv, es, fr, zh } as Record<string, MembershipCopy>)[language] ?? en;
}

export function formatMembershipExpiry(expiresAt: string | null, language: string): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, { dateStyle: "long", timeStyle: "short" }).format(date);
}

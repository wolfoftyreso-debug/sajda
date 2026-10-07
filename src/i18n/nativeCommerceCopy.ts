import type { Language } from "./languagePreference";
import { getPricingCopy } from "./pricingCopy";
import { getMembershipCopy } from "./membershipCopy";
import { hasPlanLevel } from "../../shared/account-membership";
import type { PaidPlanId } from "../../shared/plans";
import { TRADING_CAPACITY } from "../../shared/trading-capacity";
const en = {
  title:"App Store subscriptions", intro:"One Sajda account across the app and website. Apple handles subscriptions bought in the app.",
  loading:"Checking App Store plans…", unavailable:"In-app subscriptions are not available yet. Existing account access is unchanged.",
  retry:"Check again", buy:"Subscribe", month:"per month", restore:"Restore purchases", manage:"Manage Apple subscription",
  restored:"Apple purchases checked. Your account access has been refreshed.", pending:"Waiting for Apple approval. You have not received new access yet.",
  cancelled:"Purchase canceled. No new access was added.", verified:"Purchase verified. Your account access has been refreshed.",
  error:"The App Store action could not be confirmed. Do not buy again. Check your connection and use Restore purchases to retry.",
  terms:"Subscriptions renew automatically until canceled in Apple subscription settings. Apple shows the final price before confirmation.",
  account:"Restore using the same Apple Account and Sajda account used for the purchase.",
  paused:"New purchases are currently unavailable. You can still restore or manage an existing Apple subscription.",
  no_active:"Apple purchases checked. No active App Store subscription was found for this Sajda account.",
  releasedFeatures:"Included now",
  basicScope:"Basic currently has the same released features as Free. Higher plan-based search limits are not active.",
  research:"Lost Domains research workspace with sources, check history and risk-assessed candidates",
  researchCapacity:"Each new research run checks up to {sources} source pages and {candidates} candidates, with up to {results} report entries.",
  researchLimit:"These are capacity limits, not a promised number of opportunities. Research does not guarantee availability, value or returns.",
  standardLimits:"Automatic monitoring is not included. Searches depend on provider availability and shared usage limits; subscribing does not currently increase those limits. Domain purchases are separate.",
  privacy:"Privacy policy",legal:"Terms of use",
};
type Copy={ [K in keyof typeof en]: string };
const messages:Record<Language,Copy>={
  en,
  sv:{title:"Abonnemang via App Store",intro:"Samma Sajda-konto i appen och på webben. Apple hanterar abonnemang som köps i appen.",
    loading:"Kontrollerar abonnemang i App Store…",unavailable:"Abonnemang i appen är inte tillgängliga ännu. Din befintliga åtkomst påverkas inte.",
    retry:"Kontrollera igen",buy:"Prenumerera",month:"per månad",restore:"Återställ köp",manage:"Hantera Apple-abonnemang",
    restored:"Apple-köpen har kontrollerats. Kontots åtkomst har uppdaterats.",pending:"Väntar på godkännande från Apple. Du har ännu inte fått någon ny åtkomst.",
    cancelled:"Köpet avbröts. Ingen ny åtkomst har lagts till.",verified:"Köpet är verifierat. Kontots åtkomst har uppdaterats.",
    error:"Åtgärden i App Store kunde inte bekräftas. Köp inte igen. Kontrollera anslutningen och välj Återställ köp för att försöka igen.",
    terms:"Abonnemang förnyas automatiskt tills de sägs upp i Apples abonnemangsinställningar. Apple visar slutpriset innan du bekräftar.",
    account:"Återställ med samma Apple-konto och Sajda-konto som användes vid köpet.",
    paused:"Nya köp är inte tillgängliga just nu. Du kan fortfarande återställa eller hantera ett befintligt Apple-abonnemang.",
    no_active:"Apple-köpen har kontrollerats. Inget aktivt App Store-abonnemang hittades för detta Sajda-konto.",
    releasedFeatures:"Det här ingår nu",basicScope:"Bas har för närvarande samma lanserade funktioner som Gratis. Högre sökgränser per paket är inte aktiva.",
    research:"Lost Domains-arbetsyta med källor, kontrollhistorik och riskbedömda kandidater",
    researchCapacity:"Varje ny granskning kontrollerar upp till {sources} källsidor och {candidates} kandidater, med upp till {results} poster i rapporten.",
    researchLimit:"Detta är kapacitetsgränser, inte ett utlovat antal möjligheter. Granskningen garanterar inte tillgänglighet, värde eller avkastning.",
    standardLimits:"Automatisk bevakning ingår inte. Sökningar beror på leverantörernas tillgänglighet och gemensamma användningsgränser; ett abonnemang höjer inte dessa gränser idag. Domänköp betalas separat.",
    privacy:"Integritetspolicy",legal:"Användarvillkor"},
  es:{title:"Suscripciones de App Store",intro:"Una sola cuenta de Sajda para la app y la web. Apple gestiona las suscripciones compradas en la app.",
    loading:"Consultando los planes de App Store…",unavailable:"Las suscripciones en la app aún no están disponibles. Tu acceso actual no cambia.",
    retry:"Volver a comprobar",buy:"Suscribirse",month:"al mes",restore:"Restaurar compras",manage:"Gestionar suscripción de Apple",
    restored:"Compras de Apple comprobadas. Se ha actualizado el acceso de tu cuenta.",pending:"Esperando la aprobación de Apple. Todavía no tienes acceso adicional.",
    cancelled:"Compra cancelada. No se ha añadido acceso.",verified:"Compra verificada. Se ha actualizado el acceso de tu cuenta.",
    error:"No se pudo confirmar la operación de App Store. No vuelvas a comprar. Revisa la conexión y usa Restaurar compras para reintentar.",
    terms:"Las suscripciones se renuevan automáticamente hasta que las canceles en los ajustes de Apple. Apple muestra el precio final antes de confirmar.",
    account:"Restaura con la misma cuenta de Apple y de Sajda que utilizaste al comprar.",
    paused:"Las compras nuevas no están disponibles por ahora. Aún puedes restaurar o gestionar una suscripción de Apple existente.",
    no_active:"Compras de Apple comprobadas. No se encontró una suscripción activa de App Store para esta cuenta de Sajda.",
    releasedFeatures:"Incluido ahora",basicScope:"Básico ofrece actualmente las mismas funciones disponibles que Gratis. Los límites de búsqueda más altos por plan aún no están activos.",
    research:"Espacio Lost Domains con fuentes, historial de comprobaciones y candidatos con análisis de riesgos",
    researchCapacity:"Cada nueva investigación consulta hasta {sources} páginas fuente y {candidates} candidatos, con hasta {results} entradas en el informe.",
    researchLimit:"Son límites de capacidad, no un número garantizado de oportunidades. La investigación no garantiza disponibilidad, valor ni rentabilidad.",
    standardLimits:"No se incluye seguimiento automático. Las búsquedas dependen de la disponibilidad de los proveedores y de límites de uso compartidos; la suscripción no aumenta actualmente esos límites. Los dominios se compran por separado.",
    privacy:"Política de privacidad",legal:"Condiciones de uso"},
  fr:{title:"Abonnements App Store",intro:"Un seul compte Sajda pour l’app et le site. Apple gère les abonnements achetés dans l’app.",
    loading:"Vérification des offres App Store…",unavailable:"Les abonnements dans l’app ne sont pas encore disponibles. Votre accès actuel reste inchangé.",
    retry:"Vérifier à nouveau",buy:"S’abonner",month:"par mois",restore:"Restaurer les achats",manage:"Gérer l’abonnement Apple",
    restored:"Achats Apple vérifiés. L’accès de votre compte a été actualisé.",pending:"En attente de l’approbation d’Apple. Aucun accès supplémentaire n’a encore été accordé.",
    cancelled:"Achat annulé. Aucun accès supplémentaire n’a été accordé.",verified:"Achat vérifié. L’accès de votre compte a été actualisé.",
    error:"L’opération App Store n’a pas pu être confirmée. N’achetez pas à nouveau. Vérifiez votre connexion, puis réessayez avec Restaurer les achats.",
    terms:"Les abonnements sont renouvelés automatiquement jusqu’à leur résiliation dans les réglages Apple. Apple affiche le prix final avant confirmation.",
    account:"Restaurez avec les mêmes comptes Apple et Sajda que lors de l’achat.",
    paused:"Les nouveaux achats sont indisponibles pour le moment. Vous pouvez toujours restaurer ou gérer un abonnement Apple existant.",
    no_active:"Achats Apple vérifiés. Aucun abonnement App Store actif n’a été trouvé pour ce compte Sajda.",
    releasedFeatures:"Inclus aujourd’hui",basicScope:"Basique propose actuellement les mêmes fonctions disponibles que Gratuit. Les limites de recherche supérieures par offre ne sont pas actives.",
    research:"Espace Lost Domains avec sources, historique des vérifications et candidats accompagnés d’une analyse des risques",
    researchCapacity:"Chaque nouvelle analyse vérifie jusqu’à {sources} pages sources et {candidates} candidats, avec jusqu’à {results} entrées dans le rapport.",
    researchLimit:"Ce sont des limites de capacité, pas un nombre d’opportunités garanti. L’analyse ne garantit ni disponibilité, ni valeur, ni rendement.",
    standardLimits:"La surveillance automatique n’est pas incluse. Les recherches dépendent de la disponibilité des fournisseurs et de limites d’utilisation partagées ; l’abonnement n’augmente pas ces limites actuellement. Les domaines s’achètent séparément.",
    privacy:"Politique de confidentialité",legal:"Conditions d’utilisation"},
  zh:{title:"App Store 订阅",intro:"App 和网站使用同一个 Sajda 账户。通过 App 购买的订阅由 Apple 管理。",
    loading:"正在检查 App Store 订阅…",unavailable:"App 内订阅尚未开放。现有账户权限不受影响。",
    retry:"重新检查",buy:"订阅",month:"每月",restore:"恢复购买",manage:"管理 Apple 订阅",
    restored:"已检查 Apple 购买记录并刷新账户权限。",pending:"正在等待 Apple 批准，尚未获得新增权限。",
    cancelled:"购买已取消，未增加任何权限。",verified:"购买已验证，账户权限已刷新。",
    error:"无法确认 App Store 操作。请勿重复购买。请检查网络连接，然后使用“恢复购买”重试。",
    terms:"订阅会自动续订，直到您在 Apple 订阅设置中取消。Apple 会在确认前显示最终价格。",
    account:"请使用购买时所用的 Apple 账户和 Sajda 账户恢复购买。",
    paused:"暂时无法进行新购买。您仍可恢复或管理现有 Apple 订阅。",
    no_active:"已检查 Apple 购买记录。未找到属于此 Sajda 账户的有效 App Store 订阅。",
    releasedFeatures:"目前包含的功能",basicScope:"基础方案目前与免费方案提供相同的已上线功能。按方案提高的搜索限额尚未启用。",
    research:"Lost Domains 研究工作区，提供来源、检查历史和附带风险分析的候选域名",
    researchCapacity:"每次新研究最多检查 {sources} 个来源页面和 {candidates} 个候选域名，报告最多包含 {results} 条记录。",
    researchLimit:"这些是处理容量上限，不代表保证找到相应数量的机会。研究不保证可注册性、价值或回报。",
    standardLimits:"不包含自动监控。搜索取决于服务商可用性和共享使用限额；订阅目前不会提高这些限额。购买域名需另行付费。",
    privacy:"隐私政策",legal:"使用条款"},
};
export const nativeCommerceCopy=(language:Language):Copy=>messages[language]??en;

/** Describe shipped features only; planned web-plan benefits are not a purchase promise. */
export function nativePlanFeatures(plan:PaidPlanId,language:Language):string[]{
  const features=[...getPricingCopy(language).plans.free.points];
  if(hasPlanLevel(plan,"premium"))features.push(getMembershipCopy(language).undo);
  if(hasPlanLevel(plan,"trading")){
    const copy=nativeCommerceCopy(language);
    features.push(copy.research,copy.researchCapacity
      .replace("{sources}",String(TRADING_CAPACITY.sourceLimit))
      .replace("{candidates}",String(TRADING_CAPACITY.candidateLimit))
      .replace("{results}",String(TRADING_CAPACITY.reportLimit)));
  }
  return features;
}

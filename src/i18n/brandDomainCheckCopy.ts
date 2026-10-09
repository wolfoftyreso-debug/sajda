import type { Language } from "./LanguageProvider";

const en = {
  title: "Check domain registration", action: "Check selected domains", checking: "Checking registries…", stop: "Stop checks",
  help: "Only the selected domain names are sent when you start. Each batch uses your normal search allowance. Registry status is not proof that this brand owns a domain. Your reports stay local and unchanged.",
  unsupported: "No automatic check for these domains", progress: "Current registry signals", separator: "of", remaining: "Domain checks still unknown",
  done: "Checks finished. Unknown results remain explicitly unverified.", failed: "Some checks could not finish. Completed observations remain visible; retry checks the selected domains again.", cancelled: "Checks stopped. Completed observations remain visible.",
  limited: "Your search allowance could not start the next batch. Completed observations remain visible; unchecked domains stay unknown.",
  privacy: "Local worksheet: your reports are not saved or sent to providers. Optional domain checks send only the selected domains after you click. Reloading or leaving clears this worksheet.",
};
type Copy = { [K in keyof typeof en]: string };
export const brandDomainCheckCopy: Record<Language, Copy> = {
  en,
  sv: { title: "Kontrollera domänregistrering", action: "Kontrollera valda domäner", checking: "Kontrollerar register…", stop: "Avbryt kontroller",
    help: "Bara de valda domännamnen skickas när du startar. Varje omgång använder ditt vanliga sökutrymme. Registerstatus bevisar inte att varumärket äger domänen. Dina egna uppgifter stannar lokalt och ändras inte.",
    unsupported: "Ingen automatisk kontroll för dessa domäner", progress: "Aktuella registersignaler", separator: "av", remaining: "Domänkontroller som fortfarande är okända",
    done: "Kontrollerna är klara. Okända resultat är fortfarande uttryckligen overifierade.", failed: "Vissa kontroller kunde inte slutföras. Genomförda observationer visas fortfarande. Försök igen kontrollerar de valda domänerna på nytt.", cancelled: "Kontrollerna avbröts. Genomförda observationer visas fortfarande.",
    limited: "Ditt sökutrymme räckte inte för att starta nästa omgång. Genomförda observationer visas fortfarande. Okontrollerade domäner förblir okända.",
    privacy: "Lokalt arbetsblad: dina egna uppgifter sparas inte och skickas inte till leverantörer. Valfria domänkontroller skickar bara valda domäner efter ditt klick. Om du laddar om eller lämnar sidan rensas arbetsbladet.", },
  es: { title: "Comprobar el registro de dominios", action: "Comprobar dominios seleccionados", checking: "Consultando registros…", stop: "Detener comprobaciones",
    help: "Solo se envían los dominios seleccionados cuando empiezas. Cada lote usa tu cuota habitual. El registro no demuestra que esta marca sea propietaria del dominio. Tus declaraciones siguen locales y sin cambios.",
    unsupported: "Sin comprobación automática para estos dominios", progress: "Señales actuales del registro", separator: "de", remaining: "Comprobaciones de dominio aún desconocidas",
    done: "Comprobaciones terminadas. Los resultados desconocidos siguen sin verificar.", failed: "Algunas comprobaciones no terminaron. Las observaciones completadas siguen visibles; reintentar comprueba de nuevo los dominios seleccionados.", cancelled: "Comprobaciones detenidas. Las observaciones completadas siguen visibles.",
    limited: "Tu cuota no permitió iniciar el siguiente lote. Las observaciones completadas siguen visibles; los dominios no comprobados permanecen desconocidos.",
    privacy: "Hoja local: tus declaraciones no se guardan ni se envían a proveedores. Las comprobaciones opcionales envían solo los dominios seleccionados después de tu clic. Recargar o salir borra la hoja.", },
  fr: { title: "Vérifier l’enregistrement des domaines", action: "Vérifier les domaines sélectionnés", checking: "Consultation des registres…", stop: "Arrêter les vérifications",
    help: "Seuls les domaines sélectionnés sont envoyés au démarrage. Chaque lot utilise votre quota habituel. Un enregistrement ne prouve pas que cette marque possède le domaine. Vos déclarations restent locales et inchangées.",
    unsupported: "Aucune vérification automatique pour ces domaines", progress: "Signaux actuels des registres", separator: "sur", remaining: "Vérifications de domaine encore inconnues",
    done: "Vérifications terminées. Les résultats inconnus restent explicitement non vérifiés.", failed: "Certaines vérifications ont échoué. Les observations terminées restent visibles ; réessayer vérifie à nouveau les domaines sélectionnés.", cancelled: "Vérifications arrêtées. Les observations terminées restent visibles.",
    limited: "Votre quota n’a pas permis de lancer le lot suivant. Les observations terminées restent visibles ; les domaines non vérifiés restent inconnus.",
    privacy: "Feuille locale : vos déclarations ne sont ni enregistrées ni envoyées aux fournisseurs. Les vérifications facultatives envoient uniquement les domaines sélectionnés après votre clic. Recharger ou quitter efface cette feuille.", },
  zh: { title: "检查域名注册状态", action: "检查所选域名", checking: "正在查询注册局…", stop: "停止检查",
    help: "只有在您启动后才发送所选域名。每批使用常规搜索额度。注册状态不能证明该品牌拥有域名。您的声明仍保留在本地且不会改变。",
    unsupported: "以下域名尚不支持自动检查", progress: "当前注册局信号", separator: "/", remaining: "仍未知的域名检查",
    done: "检查已完成。未知结果仍明确标为未验证。", failed: "部分检查未完成。已完成的观察仍显示；重试会重新检查所选域名。", cancelled: "检查已停止。已完成的观察仍显示。",
    limited: "搜索额度未能启动下一批检查。已完成的观察仍然显示；未检查的域名仍为未知。",
    privacy: "本地工作表：您的声明不会保存或发送给提供商。可选域名检查仅在您点击后发送所选域名。重新加载或离开将清除工作表。", },
};

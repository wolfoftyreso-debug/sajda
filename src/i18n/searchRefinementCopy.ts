import type { Language } from "./LanguageProvider";
import type { RefinementReason } from "../../shared/search-refinement";

type SearchRefinementCopy = {
  title: string;
  lead: string;
  reasonsLabel: string;
  reasons: Record<RefinementReason, string>;
  namesSummary: string;
  namesHint: string;
  selectedNames: string;
  selectedLimit: string;
  clear: string;
  submit: string;
  submitting: string;
  requestNote: string;
  chooseFeedback: string;
  failed: string;
  checksUnavailable: string;
  shown: string;
  showMore: string;
  showMoreHint: string;
  modeAi: string;
  modeLocal: string;
  modeAiNote: string;
  modeLocalNote: string;
  modeAiUnavailableNote: string;
  noGuarantee: string;
};

export const searchRefinementCopy: Record<Language, SearchRefinementCopy> = {
  en: {
    title: "What should change?",
    lead: "Choose what to improve or names to build on.",
    reasonsLabel: "What is not working?",
    reasons: {
      too_generic: "Too generic",
      hard_to_spell: "Hard to spell",
      too_long: "Too long",
      wrong_tone: "Wrong tone",
    },
    namesSummary: "Names to build on",
    namesHint: "Choose up to 5. These guide the next search; they are not saved domains.",
    selectedNames: "{count} of 5 selected",
    selectedLimit: "5 selected. Deselect one to choose another.",
    clear: "Clear feedback",
    submit: "Find new suggestions",
    submitting: "Finding new suggestions…",
    requestNote: "Starts a new search. The usual search limits still apply.",
    chooseFeedback: "Choose a change or a name first.",
    failed: "The new search could not start. Your feedback is still here. Try again.",
    checksUnavailable: "The new names could not be verified. Your previous results are still here. Try again shortly.",
    shown: "Showing {shown} of {total} results",
    showMore: "Show {count} more",
    showMoreHint: "More results from this search. No new search needed.",
    modeAi: "AI-assisted naming",
    modeLocal: "Local naming rules",
    modeAiNote: "Your idea and any feedback guide the suggestions. Availability is checked separately.",
    modeLocalNote: "Local rules use your criteria and any feedback. Tone may not be interpreted precisely.",
    modeAiUnavailableNote: "AI could not provide usable suggestions this time. These names were generated with local rules.",
    noGuarantee: "Suggestions still need availability checks. Feedback does not guarantee a match.",
  },
  sv: {
    title: "Vad vill du ändra?",
    lead: "Välj vad som kan bli bättre eller namn att bygga vidare på.",
    reasonsLabel: "Vad fungerar inte?",
    reasons: {
      too_generic: "För generiska",
      hard_to_spell: "Svåra att stava",
      too_long: "För långa",
      wrong_tone: "Fel känsla",
    },
    namesSummary: "Namn att bygga vidare på",
    namesHint: "Välj upp till 5. De vägleder nästa sökning men läggs inte till bland sparade domäner.",
    selectedNames: "{count} av 5 valda",
    selectedLimit: "5 valda. Avmarkera ett för att välja ett annat.",
    clear: "Rensa återkoppling",
    submit: "Hitta nya förslag",
    submitting: "Tar fram nya förslag…",
    requestNote: "Startar en ny sökning. De vanliga sökgränserna gäller även här.",
    chooseFeedback: "Välj först en ändring eller ett namn.",
    failed: "Den nya sökningen kunde inte starta. Din återkoppling finns kvar. Försök igen.",
    checksUnavailable: "De nya namnen kunde inte verifieras. Dina tidigare resultat finns kvar. Försök igen om en stund.",
    shown: "Visar {shown} av {total} resultat",
    showMore: "Visa {count} till",
    showMoreHint: "Fler resultat från samma sökning. Ingen ny sökning behövs.",
    modeAi: "Namnförslag med AI",
    modeLocal: "Lokala namnregler",
    modeAiNote: "Din idé och eventuell återkoppling styr förslagen. Tillgängligheten kontrolleras separat.",
    modeLocalNote: "Lokala regler tar hänsyn till dina önskemål och eventuell återkoppling. Den önskade känslan kan vara svår att tolka exakt.",
    modeAiUnavailableNote: "AI kunde inte ge användbara förslag den här gången. Namnen togs fram med lokala regler.",
    noGuarantee: "Förslagens tillgänglighet behöver fortfarande kontrolleras. Återkoppling garanterar inte att du hittar rätt namn.",
  },
  es: {
    title: "¿Qué quieres cambiar?",
    lead: "Elige qué mejorar o qué nombres tomar como referencia.",
    reasonsLabel: "¿Qué no te convence?",
    reasons: {
      too_generic: "Demasiado genéricos",
      hard_to_spell: "Difíciles de escribir",
      too_long: "Demasiado largos",
      wrong_tone: "No tienen el tono adecuado",
    },
    namesSummary: "Nombres de referencia",
    namesHint: "Elige hasta 5. Orientan la próxima búsqueda, pero no se añaden a tus dominios guardados.",
    selectedNames: "{count} de 5 seleccionados",
    selectedLimit: "Has elegido 5. Desmarca uno para elegir otro.",
    clear: "Borrar comentarios",
    submit: "Buscar nuevas sugerencias",
    submitting: "Buscando nuevas sugerencias…",
    requestNote: "Inicia una nueva búsqueda. Se siguen aplicando los límites habituales de búsqueda.",
    chooseFeedback: "Primero elige un cambio o un nombre.",
    failed: "No se pudo iniciar la nueva búsqueda. Tus comentarios siguen aquí. Inténtalo de nuevo.",
    checksUnavailable: "No se pudieron verificar los nuevos nombres. Tus resultados anteriores siguen aquí. Inténtalo de nuevo en unos instantes.",
    shown: "Se muestran {shown} de {total} resultados",
    showMore: "Mostrar {count} más",
    showMoreHint: "Más resultados de esta búsqueda, sin iniciar otra.",
    modeAi: "Sugerencias con IA",
    modeLocal: "Reglas locales de nombres",
    modeAiNote: "Tu idea y los comentarios que aportes orientan las sugerencias. La disponibilidad se comprueba por separado.",
    modeLocalNote: "Las reglas locales usan tus criterios y los comentarios que aportes. Puede que no interpreten el tono con precisión.",
    modeAiUnavailableNote: "Esta vez, la IA no pudo generar sugerencias útiles. Estos nombres se generaron con reglas locales.",
    noGuarantee: "Aún hay que comprobar la disponibilidad de las sugerencias. Tus comentarios no garantizan encontrar el nombre adecuado.",
  },
  fr: {
    title: "Que souhaitez-vous changer ?",
    lead: "Choisissez ce qui peut être amélioré ou les noms à prendre comme point de départ.",
    reasonsLabel: "Qu’est-ce qui ne vous convient pas ?",
    reasons: {
      too_generic: "Trop génériques",
      hard_to_spell: "Difficiles à écrire",
      too_long: "Trop longs",
      wrong_tone: "Le ton ne convient pas",
    },
    namesSummary: "Noms à prendre comme point de départ",
    namesHint: "Choisissez jusqu’à 5 noms. Ils orientent la prochaine recherche, sans être ajoutés à vos domaines enregistrés.",
    selectedNames: "{count} sur 5 sélectionnés",
    selectedLimit: "Vous avez choisi 5 noms. Désélectionnez-en un pour en choisir un autre.",
    clear: "Effacer les préférences",
    submit: "Trouver de nouvelles suggestions",
    submitting: "Recherche de nouvelles suggestions…",
    requestNote: "Lance une nouvelle recherche. Les limites de recherche habituelles s’appliquent toujours.",
    chooseFeedback: "Choisissez d’abord un changement ou un nom.",
    failed: "La nouvelle recherche n’a pas pu démarrer. Vos préférences sont conservées. Réessayez.",
    checksUnavailable: "Les nouveaux noms n’ont pas pu être vérifiés. Vos résultats précédents sont conservés. Réessayez dans un instant.",
    shown: "{shown} résultats affichés sur {total}",
    showMore: "Afficher {count} résultats de plus",
    showMoreHint: "D’autres résultats de cette recherche, sans en lancer une nouvelle.",
    modeAi: "Suggestions avec l’IA",
    modeLocal: "Règles locales de création de noms",
    modeAiNote: "Votre idée et vos éventuelles préférences orientent les suggestions. La disponibilité est vérifiée séparément.",
    modeLocalNote: "Les règles locales utilisent vos critères et vos éventuelles préférences. Le ton peut ne pas être interprété avec précision.",
    modeAiUnavailableNote: "L’IA n’a pas fourni de suggestions utilisables cette fois-ci. Ces noms ont été générés à partir de règles locales.",
    noGuarantee: "La disponibilité des suggestions reste à vérifier. Vos préférences ne garantissent pas de trouver le nom qui vous convient.",
  },
  zh: {
    title: "你想调整哪些方面？",
    lead: "选择需要改进的方面，或值得继续探索的名字。",
    reasonsLabel: "哪些方面不合适？",
    reasons: {
      too_generic: "太普通",
      hard_to_spell: "难拼写",
      too_long: "太长",
      wrong_tone: "风格不符",
    },
    namesSummary: "作为参考的名字",
    namesHint: "最多选择 5 个，用于指导下一次搜索，不会加入已保存的域名。",
    selectedNames: "已选 {count} 个，最多 5 个",
    selectedLimit: "已选 5 个。请先取消一个，再选择其他名字。",
    clear: "清除反馈",
    submit: "查找新建议",
    submitting: "正在查找新建议…",
    requestNote: "将发起新的搜索，仍受常规搜索限制。",
    chooseFeedback: "请先选择调整方向或一个名字。",
    failed: "未能开始新的搜索。你的反馈已保留，请重试。",
    checksUnavailable: "未能核验新名字。之前的结果已保留，请稍后重试。",
    shown: "显示 {shown} 条，共 {total} 条结果",
    showMore: "再显示 {count} 条",
    showMoreHint: "查看本次搜索的更多结果，不会发起新的搜索。",
    modeAi: "AI 辅助命名",
    modeLocal: "本地命名规则",
    modeAiNote: "你的想法和所提供的反馈会指导命名建议。域名可用性将单独核验。",
    modeLocalNote: "本地规则会参考你的条件和反馈，但可能无法准确理解你想要的风格。",
    modeAiUnavailableNote: "本次 AI 未能提供合适的命名建议，这些名字已改用本地规则生成。",
    noGuarantee: "建议的域名仍需核验可用性。提供反馈不保证找到合适的名字。",
  },
};

export function refinementText(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));
}

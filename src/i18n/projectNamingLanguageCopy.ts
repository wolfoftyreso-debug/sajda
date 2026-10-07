import type { Language } from "./LanguageProvider";

const en = {
  title: "Choose the primary naming language",
  requested: "Saved project languages: {languages}.",
  multiple: "This project requests several languages. Sajda generates names in one supported language at a time. Choose a primary language; the other project requirements are kept, not automatically checked.",
  unsupported: "This project includes a language that name generation does not support yet. Its saved requirements are kept. Choose a supported primary language before generating names.",
  choose: "Choose a supported language",
  selected: "Names will be generated in {language}. Suitability, meaning and pronunciation in the other project languages have not been checked.",
  required: "Select a supported primary language before generating names. Your saved project language requirements have not been changed.",
  chinese: "Simplified Chinese",
};

export const projectNamingLanguageCopy: Record<Language, typeof en> = {
  en,
  sv: {
    title: "Välj huvudspråk för namnförslagen",
    requested: "Sparade projektspråk: {languages}.",
    multiple: "Projektet omfattar flera språk. Sajda genererar namn på ett språk som stöds åt gången. Välj ett huvudspråk; övriga projektkrav behålls men kontrolleras inte automatiskt.",
    unsupported: "Projektet omfattar ett språk som namngenereringen ännu inte stöder. De sparade kraven behålls. Välj ett huvudspråk som stöds innan du genererar namn.",
    choose: "Välj ett språk som stöds",
    selected: "Namnförslagen genereras på {language}. Lämplighet, betydelse och uttal på projektets övriga språk har inte kontrollerats.",
    required: "Välj ett huvudspråk som stöds innan du genererar namn. Projektets sparade språkkrav har inte ändrats.",
    chinese: "Förenklad kinesiska",
  },
  es: {
    title: "Elige el idioma principal de los nombres",
    requested: "Idiomas guardados del proyecto: {languages}.",
    multiple: "El proyecto requiere varios idiomas. Sajda genera nombres en un solo idioma compatible cada vez. Elige un idioma principal; los demás requisitos se conservan, pero no se comprueban automáticamente.",
    unsupported: "El proyecto incluye un idioma que la generación de nombres aún no admite. Los requisitos guardados se conservan. Elige un idioma principal compatible antes de generar nombres.",
    choose: "Elige un idioma compatible",
    selected: "Los nombres se generarán en {language}. No se han comprobado su idoneidad, significado ni pronunciación en los demás idiomas del proyecto.",
    required: "Selecciona un idioma principal compatible antes de generar nombres. No se han cambiado los requisitos de idioma guardados del proyecto.",
    chinese: "Chino simplificado",
  },
  fr: {
    title: "Choisissez la langue principale des noms",
    requested: "Langues enregistrées du projet : {languages}.",
    multiple: "Ce projet prévoit plusieurs langues. Sajda génère des noms dans une seule langue prise en charge à la fois. Choisissez une langue principale ; les autres exigences sont conservées, sans vérification automatique.",
    unsupported: "Ce projet prévoit une langue qui n’est pas encore prise en charge pour la génération de noms. Les exigences enregistrées sont conservées. Choisissez une langue principale prise en charge avant de générer des noms.",
    choose: "Choisissez une langue prise en charge",
    selected: "Les noms seront générés en {language}. Leur pertinence, leur sens et leur prononciation dans les autres langues du projet n’ont pas été vérifiés.",
    required: "Sélectionnez une langue principale prise en charge avant de générer des noms. Les exigences linguistiques enregistrées du projet n’ont pas été modifiées.",
    chinese: "Chinois simplifié",
  },
  zh: {
    title: "选择名称生成的主要语言",
    requested: "项目已保存的语言要求：{languages}。",
    multiple: "本项目有多种语言要求。Sajda 每次只使用一种受支持的语言生成名称。请选择主要语言；其他要求将保留，但不会自动核查。",
    unsupported: "本项目包含名称生成暂不支持的语言。已保存的要求将保留。生成名称前，请选择一种受支持的主要语言。",
    choose: "选择受支持的语言",
    selected: "名称将使用{language}生成。尚未核查其在项目其他语言中的适用性、含义或发音。",
    required: "生成名称前，请选择一种受支持的主要语言。项目已保存的语言要求未被更改。",
    chinese: "简体中文",
  },
};

import type { Language } from "./LanguageProvider";
import type { BrandNameLanguage } from "../../shared/name-languages";

type NameLanguageCopy = { label: string; hint: string; result: string; names: Record<BrandNameLanguage, string> };

export const nameLanguageCopy: Record<Language, NameLanguageCopy> = {
  en: { label: "Name language", hint: "Choose the language for name ideas, not the website. Domain spellings use a–z without accents.", result: "Name language",
    names: { en: "English", sv: "Swedish", fr: "French", es: "Spanish", de: "German", it: "Italian", pt: "Portuguese" } },
  sv: { label: "Namnspråk", hint: "Välj språk för namnförslagen, inte för webbplatsen. Domännamnen skrivs med a–z utan accenter, å, ä eller ö.", result: "Namnspråk",
    names: { en: "Engelska", sv: "Svenska", fr: "Franska", es: "Spanska", de: "Tyska", it: "Italienska", pt: "Portugisiska" } },
  fr: { label: "Langue du nom", hint: "Choisissez la langue des suggestions, pas celle du site. Les noms de domaine utilisent les lettres a–z sans accents.", result: "Langue du nom",
    names: { en: "Anglais", sv: "Suédois", fr: "Français", es: "Espagnol", de: "Allemand", it: "Italien", pt: "Portugais" } },
  es: { label: "Idioma del nombre", hint: "Elige el idioma de las sugerencias, no el del sitio. Los dominios usan las letras a–z sin tildes ni otros signos diacríticos.", result: "Idioma del nombre",
    names: { en: "Inglés", sv: "Sueco", fr: "Francés", es: "Español", de: "Alemán", it: "Italiano", pt: "Portugués" } },
  zh: { label: "名称语言", hint: "选择名称建议的语言，而不是网站界面的语言。域名使用不带重音符号的 a–z 字母。", result: "名称语言",
    names: { en: "英语", sv: "瑞典语", fr: "法语", es: "西班牙语", de: "德语", it: "意大利语", pt: "葡萄牙语" } },
};

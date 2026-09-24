import type { Language } from "./LanguageProvider";

/** Small navigation copy: do not load the full report translations on Home. */
export const namePackageEntryCopy: Record<Language, { title: string; action: string }> = {
  en: { title: "Brand packages", action: "Find a brand package" },
  sv: { title: "Varumärkespaket", action: "Hitta ett varumärkespaket" },
  es: { title: "Paquetes de marca", action: "Buscar un paquete de marca" },
  fr: { title: "Identités de marque", action: "Trouver une identité de marque" },
  zh: { title: "品牌方案", action: "寻找品牌方案" },
};

import type { Language } from "./languagePreference";

export const projectEntryCopy: Record<Language, {
  projects: string; short: string; back: string; context: string; budget: string;
}> = {
  en: { projects: "Name projects", short: "Projects", back: "Back to project", context: "Your project brief is ready below. Start the search when you’re ready, save the names you like, then add them to your project.", budget: "Your budget guides the brief; it is not an automatic price filter. Check each name’s current registration and renewal price." },
  sv: { projects: "Namnprojekt", short: "Projekt", back: "Tillbaka till projektet", context: "Din projektbeskrivning är förberedd nedan. Starta sökningen, spara namn du gillar och lägg sedan till dem i projektet.", budget: "Budgeten är ett önskemål i beskrivningen, inte ett automatiskt prisfilter. Kontrollera varje namns aktuella registrerings- och förnyelsepris." },
  es: { projects: "Proyectos de nombres", short: "Proyectos", back: "Volver al proyecto", context: "La descripción de tu proyecto está lista abajo. Inicia la búsqueda cuando quieras, guarda los nombres que te gusten y añádelos a tu proyecto.", budget: "El presupuesto orienta la búsqueda; no es un filtro automático de precios. Comprueba el precio actual de registro y renovación de cada nombre." },
  fr: { projects: "Projets de nom", short: "Projets", back: "Retour au projet", context: "La description de votre projet est prête ci-dessous. Lancez la recherche, enregistrez les noms qui vous plaisent, puis ajoutez-les à votre projet.", budget: "Le budget est une indication, pas un filtre de prix automatique. Vérifiez les prix actuels d’enregistrement et de renouvellement de chaque nom." },
  zh: { projects: "命名项目", short: "项目", back: "返回项目", context: "项目说明已填入下方。准备好后即可开始搜索，保存喜欢的名称，再将它们添加到项目中。", budget: "预算仅作为命名说明中的参考，并非自动价格筛选器。请核对每个名称当前的注册费和续费。" },
};

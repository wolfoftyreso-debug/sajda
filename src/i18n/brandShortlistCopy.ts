import type { Language } from "./languagePreference";

const en = {
  save: "Save brand package", title: "Keep this brand package", intro: "Save the name, domains, platforms and markets to a private project. Recheck live information when you reopen it.",
  project: "Project", newProject: "Create a new project", projectTitle: "Project name", loading: "Loading your projects…", saving: "Saving package…", saved: "Brand package saved", savedHelp: "Your configuration is saved. Availability, prices and Sajda Brand Index results must be checked again when you return.",
  view: "Open project", close: "Done", retry: "Retry the same save", reload: "Reload projects", failed: "The save could not be confirmed. Retry the same save before changing the package.",
  loadFailed: "Your projects could not be loaded. No package has been saved.", conflict: "The project changed in another session. Reload it before saving this package.",
  invalid: "Check the project name. The project may also have reached its package or storage limit.", access: "Sign in with a verified email to save this package.", disabled: "Project saving is not available in this environment.",
  section: "Saved brand packages", sectionHelp: "Your selected identity configurations. Reopen a package to check availability and rebuild its Sajda Brand Index using current evidence.",
  recheck: "Open and recheck", remove: "Remove package", count: "{count} brand packages", userInput: "Saved configuration · recheck required", cancel: "Cancel", pending: "A save is still unconfirmed. Reopen this dialog to retry the same save.",
};
type Copy = Record<keyof typeof en, string>;
export const brandShortlistCopy: Record<Language, Copy> = {
  en,
  sv: {
    save: "Spara varumärkespaket", title: "Behåll varumärkespaketet", intro: "Spara namnet, domänerna, plattformarna och marknaderna i ett privat projekt. Kontrollera aktuell information när du öppnar det igen.",
    project: "Projekt", newProject: "Skapa ett nytt projekt", projectTitle: "Projektnamn", loading: "Hämtar dina projekt…", saving: "Sparar paket…", saved: "Varumärkespaketet är sparat", savedHelp: "Dina val är sparade. Tillgänglighet, priser och Sajda Brand Index behöver kontrolleras på nytt när du återkommer.",
    view: "Öppna projektet", close: "Klart", retry: "Försök spara samma paket igen", reload: "Hämta projekten igen", failed: "Det gick inte att bekräfta sparandet. Försök spara samma paket igen innan du ändrar det.",
    loadFailed: "Det gick inte att hämta dina projekt. Inget paket har sparats.", conflict: "Projektet har ändrats i en annan session. Hämta det igen innan du sparar paketet.",
    invalid: "Kontrollera projektnamnet. Projektet kan också ha nått gränsen för antal paket eller lagringsutrymme.", access: "Logga in med en verifierad e-postadress för att spara paketet.", disabled: "Det går inte att spara projekt i den här miljön.",
    section: "Sparade varumärkespaket", sectionHelp: "Dina valda namn och kanaler. Öppna ett paket för att kontrollera tillgänglighet och beräkna Sajda Brand Index med aktuellt underlag.",
    recheck: "Öppna och kontrollera igen", remove: "Ta bort paketet", count: "{count} varumärkespaket", userInput: "Sparade val · behöver kontrolleras igen", cancel: "Avbryt", pending: "Sparandet är ännu inte bekräftat. Öppna dialogrutan för att försöka spara samma paket igen.",
  },
  es: {
    save: "Guardar paquete de marca", title: "Conserva este paquete de marca", intro: "Guarda el nombre, los dominios, las plataformas y los mercados en un proyecto privado. Vuelve a comprobar la información al abrirlo.",
    project: "Proyecto", newProject: "Crear un proyecto", projectTitle: "Nombre del proyecto", loading: "Cargando tus proyectos…", saving: "Guardando paquete…", saved: "Paquete de marca guardado", savedHelp: "Tu configuración está guardada. Al volver, tendrás que comprobar la disponibilidad, los precios y Sajda Brand Index de nuevo.",
    view: "Abrir proyecto", close: "Listo", retry: "Reintentar el mismo guardado", reload: "Recargar proyectos", failed: "No se pudo confirmar el guardado. Reintenta el mismo guardado antes de cambiar el paquete.",
    loadFailed: "No se pudieron cargar tus proyectos. No se ha guardado ningún paquete.", conflict: "El proyecto cambió en otra sesión. Recárgalo antes de guardar el paquete.",
    invalid: "Revisa el nombre del proyecto. También puede haberse alcanzado el límite de paquetes o almacenamiento.", access: "Inicia sesión con un correo verificado para guardar el paquete.", disabled: "No se pueden guardar proyectos en este entorno.",
    section: "Paquetes de marca guardados", sectionHelp: "Tus configuraciones de identidad. Abre un paquete para comprobar la disponibilidad y recalcular Sajda Brand Index con datos actuales.",
    recheck: "Abrir y comprobar", remove: "Eliminar paquete", count: "{count} paquetes de marca", userInput: "Configuración guardada · requiere comprobación", cancel: "Cancelar", pending: "El guardado sigue sin confirmarse. Abre este diálogo para reintentar el mismo guardado.",
  },
  fr: {
    save: "Enregistrer le pack de marque", title: "Conservez ce pack de marque", intro: "Enregistrez le nom, les domaines, les plateformes et les marchés dans un projet privé. Vérifiez à nouveau les informations à sa réouverture.",
    project: "Projet", newProject: "Créer un projet", projectTitle: "Nom du projet", loading: "Chargement de vos projets…", saving: "Enregistrement du pack…", saved: "Pack de marque enregistré", savedHelp: "Vos choix sont enregistrés. La disponibilité, les prix et Sajda Brand Index devront être vérifiés à nouveau à votre retour.",
    view: "Ouvrir le projet", close: "Terminé", retry: "Réessayer le même enregistrement", reload: "Recharger les projets", failed: "L’enregistrement n’a pas pu être confirmé. Réessayez le même enregistrement avant de modifier le pack.",
    loadFailed: "Vos projets n’ont pas pu être chargés. Aucun pack n’a été enregistré.", conflict: "Le projet a été modifié dans une autre session. Rechargez-le avant d’enregistrer ce pack.",
    invalid: "Vérifiez le nom du projet. La limite de packs ou de stockage peut aussi avoir été atteinte.", access: "Connectez-vous avec une adresse e-mail vérifiée pour enregistrer ce pack.", disabled: "L’enregistrement des projets n’est pas disponible dans cet environnement.",
    section: "Packs de marque enregistrés", sectionHelp: "Vos configurations d’identité. Ouvrez un pack pour vérifier la disponibilité et recalculer Sajda Brand Index à partir de données actuelles.",
    recheck: "Ouvrir et revérifier", remove: "Retirer le pack", count: "{count} packs de marque", userInput: "Configuration enregistrée · à revérifier", cancel: "Annuler", pending: "L’enregistrement n’est pas encore confirmé. Rouvrez cette fenêtre pour réessayer le même enregistrement.",
  },
  zh: {
    save: "保存品牌方案", title: "保留这套品牌方案", intro: "将名称、域名、平台和市场保存到私人项目中。再次打开时，请重新核查最新信息。",
    project: "项目", newProject: "创建新项目", projectTitle: "项目名称", loading: "正在加载项目…", saving: "正在保存方案…", saved: "品牌方案已保存", savedHelp: "你的配置已保存。再次使用时，需要重新核查可用性、价格和 Sajda Brand Index。",
    view: "打开项目", close: "完成", retry: "重试同一次保存", reload: "重新加载项目", failed: "无法确认是否保存成功。请先重试同一次保存，再修改方案。",
    loadFailed: "无法加载项目。尚未保存任何方案。", conflict: "项目已在另一个会话中更改。请重新加载后再保存方案。",
    invalid: "请检查项目名称。项目也可能已达到方案数量或存储空间上限。", access: "请使用已验证的邮箱登录后保存方案。", disabled: "当前环境暂不支持保存项目。",
    section: "已保存的品牌方案", sectionHelp: "你选择的品牌配置。打开方案后，可重新核查可用性，并根据最新证据计算 Sajda Brand Index。",
    recheck: "打开并重新核查", remove: "移除方案", count: "{count} 套品牌方案", userInput: "已保存配置 · 需要重新核查", cancel: "取消", pending: "保存结果尚未确认。请重新打开此窗口以重试同一次保存。",
  },
};

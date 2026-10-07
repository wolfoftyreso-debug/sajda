import type { Language } from "./languagePreference";

const en = {
  exportTitle: "Keep a copy of this assessment", download: "Download assessment", share: "Save or share assessment", exporting: "Preparing assessment…",
  exportHelp: "Export the recorded reports and current evidence as a private HTML file. This does not save the worksheet to your account, run new checks or activate monitoring. Unrecorded field edits are not included. Keep the file somewhere safe.",
  downloaded: "The download has started. This worksheet is still only held on this page.", completed: "The export is ready. This worksheet is still only held on this page.",
  cancelled: "Export cancelled. Your work remains on this page.", failed: "The assessment could not be exported. Your work remains on this page; try again.",
  generatedAt: "Export generated", localBoundary: "Offline snapshot — not saved to a Sajda account. No additional checks were performed. Original observation and report dates are retained; exporting does not refresh evidence. This file cannot be reimported into the worksheet.",
  portableData: "Recorded scope and machine-readable evidence", leaveTitle: "Leave this local worksheet?",
  leaveBody: "Your worksheet is only held on this page. Leaving clears it, including recorded reports and checks. You can stay and export a copy first. An export is not an account save.",
};
type BrandWorksheetCopy = { [K in keyof typeof en]: string };
export const brandWorksheetCopy: Record<Language, BrandWorksheetCopy> = {
  en,
  sv: {
    exportTitle: "Behåll en kopia av bedömningen", download: "Ladda ned bedömningen", share: "Spara eller dela bedömningen", exporting: "Förbereder bedömningen…",
    exportHelp: "Exportera registrerade egna uppgifter och aktuellt underlag till en privat HTML-fil. Arbetsbladet sparas inte på ditt konto, inga nya kontroller görs och ingen bevakning aktiveras. Ändringar som inte registrerats ingår inte. Förvara filen säkert.",
    downloaded: "Nedladdningen har startat. Arbetsbladet finns fortfarande bara på denna sida.", completed: "Exporten är klar. Arbetsbladet finns fortfarande bara på denna sida.",
    cancelled: "Exporten avbröts. Ditt arbete finns kvar på sidan.", failed: "Bedömningen kunde inte exporteras. Ditt arbete finns kvar på sidan; försök igen.",
    generatedAt: "Exporten skapad", localBoundary: "Ögonblicksbild för offlinebruk — inte sparad på ett Sajda-konto. Inga ytterligare kontroller har gjorts. Ursprungliga observations- och rapportdatum behålls; exporten uppdaterar inte underlaget. Filen kan inte importeras tillbaka till arbetsbladet.",
    portableData: "Registrerat urval och maskinläsbart underlag", leaveTitle: "Lämna det lokala arbetsbladet?",
    leaveBody: "Arbetsbladet finns bara på denna sida. Om du lämnar den försvinner arbetet, inklusive registrerade uppgifter och kontroller. Stanna kvar och exportera en kopia först om du vill. Exporten sparar inte arbetet på ditt konto.",
  },
  es: {
    exportTitle: "Conserva una copia de la evaluación", download: "Descargar evaluación", share: "Guardar o compartir evaluación", exporting: "Preparando la evaluación…",
    exportHelp: "Exporta las declaraciones registradas y las pruebas actuales a un archivo HTML privado. No guarda la hoja en tu cuenta, no ejecuta nuevas comprobaciones ni activa vigilancia. Los cambios sin registrar no se incluyen. Conserva el archivo en un lugar seguro.",
    downloaded: "La descarga ha comenzado. La hoja sigue estando solo en esta página.", completed: "La exportación está lista. La hoja sigue estando solo en esta página.",
    cancelled: "Exportación cancelada. Tu trabajo permanece en esta página.", failed: "No se pudo exportar la evaluación. Tu trabajo permanece en esta página; inténtalo de nuevo.",
    generatedAt: "Exportación generada", localBoundary: "Instantánea sin conexión: no guardada en una cuenta de Sajda. No se realizaron comprobaciones adicionales. Se conservan las fechas originales de observación y declaración; exportar no actualiza las pruebas. El archivo no puede volver a importarse a la hoja.",
    portableData: "Alcance registrado y pruebas legibles por máquinas", leaveTitle: "¿Salir de esta hoja local?",
    leaveBody: "La hoja solo está en esta página. Salir la borra, incluidas las declaraciones y comprobaciones registradas. Puedes quedarte y exportar una copia primero. Exportar no guarda el trabajo en tu cuenta.",
  },
  fr: {
    exportTitle: "Conservez une copie de cette évaluation", download: "Télécharger l’évaluation", share: "Enregistrer ou partager l’évaluation", exporting: "Préparation de l’évaluation…",
    exportHelp: "Exportez les déclarations enregistrées et les preuves actuelles dans un fichier HTML privé. Cela ne sauvegarde pas la feuille dans votre compte, ne lance aucune nouvelle vérification et n’active aucune surveillance. Les modifications non enregistrées ne sont pas incluses. Conservez le fichier en lieu sûr.",
    downloaded: "Le téléchargement a commencé. La feuille reste uniquement sur cette page.", completed: "L’export est prêt. La feuille reste uniquement sur cette page.",
    cancelled: "Export annulé. Votre travail reste sur cette page.", failed: "L’évaluation n’a pas pu être exportée. Votre travail reste sur cette page ; réessayez.",
    generatedAt: "Export créé", localBoundary: "Instantané hors ligne — non sauvegardé dans un compte Sajda. Aucune vérification supplémentaire n’a été effectuée. Les dates d’observation et de déclaration originales sont conservées ; l’export ne les actualise pas. Ce fichier ne peut pas être réimporté dans la feuille.",
    portableData: "Périmètre enregistré et preuves lisibles par machine", leaveTitle: "Quitter cette feuille locale ?",
    leaveBody: "La feuille existe uniquement sur cette page. La quitter efface le travail, y compris les déclarations et vérifications enregistrées. Vous pouvez rester et exporter une copie d’abord. L’export n’est pas une sauvegarde dans votre compte.",
  },
  zh: {
    exportTitle: "保留此评估的副本", download: "下载评估", share: "保存或分享评估", exporting: "正在准备评估…",
    exportHelp: "将已记录的声明和当前证据导出为私密 HTML 文件。这不会将工作表保存到账号，不会执行新检查，也不会开启监控。尚未记录的字段修改不会包含在文件中。请妥善保管文件。",
    downloaded: "下载已开始。工作表仍仅保留在此页面上。", completed: "导出已就绪。工作表仍仅保留在此页面上。",
    cancelled: "导出已取消。你的工作仍保留在此页面上。", failed: "无法导出评估。你的工作仍保留在此页面上，请重试。",
    generatedAt: "导出生成时间", localBoundary: "离线快照——未保存到 Sajda 账号。未执行额外检查。保留原始观察和声明日期；导出不会刷新证据。此文件无法重新导入工作表。",
    portableData: "已记录的范围和机器可读证据", leaveTitle: "要离开此本地工作表吗？",
    leaveBody: "工作表仅保留在此页面上。离开会清除工作内容，包括已记录的声明和检查。你可以先留在此页并导出副本。导出不等于保存到账号。",
  },
};

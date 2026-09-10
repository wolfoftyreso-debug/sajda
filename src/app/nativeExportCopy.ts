import type { Language } from "@/i18n/LanguageProvider";

const en = { action: "Save or share", completed: "The export is ready.", cancelled: "Export cancelled. You can try again.", failed: "The file could not be exported. Try again." };
export const nativeExportCopy: Record<Language, typeof en> = {
  en,
  sv: { action: "Spara eller dela", completed: "Exporten är klar.", cancelled: "Exporten avbröts. Du kan försöka igen.", failed: "Filen kunde inte exporteras. Försök igen." },
  es: { action: "Guardar o compartir", completed: "La exportación está lista.", cancelled: "Exportación cancelada. Puedes volver a intentarlo.", failed: "No se ha podido exportar el archivo. Inténtalo de nuevo." },
  fr: { action: "Enregistrer ou partager", completed: "L’export est prêt.", cancelled: "Export annulé. Vous pouvez réessayer.", failed: "Le fichier n’a pas pu être exporté. Réessayez." },
  zh: { action: "保存或分享", completed: "导出已就绪。", cancelled: "已取消导出，你可以重试。", failed: "无法导出文件，请重试。" },
};

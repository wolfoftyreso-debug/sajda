import type { Language } from "@/i18n/LanguageProvider";

type LocalizedNumber = number | null | undefined;

export function localeForLanguage(language: Language): string {
  return language === "zh" ? "zh-CN" : language;
}

function normalizedNumber(value: LocalizedNumber): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function formatLocalizedNumber(
  value: LocalizedNumber,
  language: Language,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(localeForLanguage(language), options).format(normalizedNumber(value));
}

export function formatLocalizedCurrency(
  value: LocalizedNumber,
  currency: string,
  language: Language,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(localeForLanguage(language), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    ...options,
  }).format(normalizedNumber(value));
}

export function formatLocalizedDateTime(
  value: string | Date | null | undefined,
  language: Language,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  const date = value instanceof Date ? value : new Date(value ?? "");

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(localeForLanguage(language), options).format(date);
}

export function formatLocalizedRelativeTime(
  value: string | Date | null | undefined,
  language: Language,
): string {
  const date = value instanceof Date ? value : new Date(value ?? "");

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const intervals: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(localeForLanguage(language), { numeric: "auto" });

  for (const [unit, duration] of intervals) {
    if (Math.abs(seconds) >= duration) {
      return formatter.format(Math.round(seconds / duration), unit);
    }
  }

  return formatter.format(seconds, "second");
}

import { Languages, SlidersHorizontal, Type } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/i18n/LanguageProvider";
import {
  ADVANCED_LENGTH_PRESETS,
  normaliseCriteriaWords,
  type AdvancedNameLanguage,
  type AdvancedNameStyle,
  type AdvancedSearchCriteria,
} from "@/lib/advancedSearchCriteria";
import { cn } from "@/lib/utils";

interface AdvancedSearchCriteriaProps {
  value: AdvancedSearchCriteria;
  onChange: (value: AdvancedSearchCriteria) => void;
  disabled?: boolean;
}

const AdvancedSearchCriteriaPanel = ({
  value,
  onChange,
  disabled = false,
}: AdvancedSearchCriteriaProps) => {
  const { language } = useLanguage();
  // Preserve punctuation and a trailing separator while someone is typing.
  // The normalized word lists still update immediately for a click on Search.
  const [includeText, setIncludeText] = useState(value.includeWords.join(", "));
  const [excludeText, setExcludeText] = useState(value.excludeWords.join(", "));
  const presentationLanguage = language as string;
  const copy = presentationLanguage === "sv"
    ? {
        title: "Sökkriterier",
        length: "Antal bokstäver",
        min: "Min",
        max: "Max",
        short: "3–5 kort",
        compact: "6–8 kompakt",
        standard: "9–12 tydligt",
        any: "3–16 valfritt",
        language: "Språk för domänförslag",
        languageDetail: "Välj svenska, engelska eller båda för förslagen. Det ändrar inte språket på sidan.",
        auto: "Automatiskt",
        english: "Engelska",
        swedish: "Svenska",
        mixed: "Blandat",
        style: "Namnform",
        balanced: "Balanserat",
        brandable: "Varumärkesbart",
        descriptive: "Beskrivande",
        invented: "Nyskapat",
        include: "Ord att prioritera",
        includePlaceholder: "t.ex. green, home",
        exclude: "Ord att undvika",
        excludePlaceholder: "t.ex. cheap, fast",
        helper: "Kommaseparera flera ord. Varje val styr vilka namn som genereras innan registry-kontrollen.",
      }
    : presentationLanguage === "es"
      ? {
          title: "Criterios de búsqueda",
          length: "Número de letras",
          min: "Mín.",
          max: "Máx.",
          short: "3–5 cortos",
          compact: "6–8 compactos",
          standard: "9–12 claros",
          any: "3–16 cualquiera",
          language: "Corpus de nombres",
          languageDetail: "La generación usa corpus de nombres en inglés y sueco. El idioma de la interfaz se controla por separado.",
          auto: "Automático",
          english: "Inglés",
          swedish: "Sueco",
          mixed: "Mixto",
          style: "Estilo de nombre",
          balanced: "Equilibrado",
          brandable: "Apto para marca",
          descriptive: "Descriptivo",
          invented: "Inventado",
          include: "Palabras que priorizar",
          includePlaceholder: "p. ej., verde, hogar",
          exclude: "Palabras que evitar",
          excludePlaceholder: "p. ej., barato, rápido",
          helper: "Separa varias palabras con comas. Cada elección guía los nombres generados antes de la comprobación en el registro.",
        }
      : presentationLanguage === "fr"
        ? {
            title: "Critères de recherche",
            length: "Nombre de lettres",
            min: "Min.",
            max: "Max.",
            short: "3–5 courts",
            compact: "6–8 compacts",
            standard: "9–12 clairs",
            any: "3–16 au choix",
            language: "Corpus de noms",
            languageDetail: "La génération utilise des corpus de noms anglais et suédois. La langue de l’interface est indépendante.",
            auto: "Automatique",
            english: "Anglais",
            swedish: "Suédois",
            mixed: "Mixte",
            style: "Style du nom",
            balanced: "Équilibré",
            brandable: "Adapté à une marque",
            descriptive: "Descriptif",
            invented: "Inventé",
            include: "Mots à privilégier",
            includePlaceholder: "ex. vert, maison",
            exclude: "Mots à éviter",
            excludePlaceholder: "ex. bon marché, rapide",
            helper: "Séparez plusieurs mots par des virgules. Chaque choix guide les noms générés avant la vérification au registre.",
          }
        : presentationLanguage === "zh"
          ? {
              title: "搜索条件",
              length: "字母数量",
              min: "最小",
              max: "最大",
              short: "3–5 短",
              compact: "6–8 紧凑",
              standard: "9–12 清晰",
              any: "3–16 任意",
              language: "命名语料库",
              languageDetail: "名称生成使用英语和瑞典语语料库；界面语言独立设置。",
              auto: "自动",
              english: "英语",
              swedish: "瑞典语",
              mixed: "混合",
              style: "名称风格",
              balanced: "均衡",
              brandable: "适合品牌",
              descriptive: "描述性",
              invented: "新造词",
              include: "优先词",
              includePlaceholder: "例如：绿色，家",
              exclude: "避免的词",
              excludePlaceholder: "例如：便宜，快速",
              helper: "用逗号分隔多个词。每个选择都会在注册局核验前引导名称生成。",
            }
    : {
        title: "Search criteria",
        length: "Letter count",
        min: "Min",
        max: "Max",
        short: "3–5 short",
        compact: "6–8 compact",
        standard: "9–12 clear",
        any: "3–16 any",
        language: "Language for domain ideas",
        languageDetail: "Choose Swedish, English or both for suggestions. This does not change the interface language.",
        auto: "Automatic",
        english: "English",
        swedish: "Swedish",
        mixed: "Mixed",
        style: "Name style",
        balanced: "Balanced",
        brandable: "Brandable",
        descriptive: "Descriptive",
        invented: "Invented",
        include: "Words to prioritise",
        includePlaceholder: "e.g. green, home",
        exclude: "Words to avoid",
        excludePlaceholder: "e.g. cheap, fast",
        helper: "Separate multiple words with commas. Each choice guides generation before registry checks run.",
      };

  const update = (patch: Partial<AdvancedSearchCriteria>) => onChange({ ...value, ...patch });
  const isPresetSelected = (minLength: number, maxLength: number) => (
    value.minLength === minLength && value.maxLength === maxLength
  );
  const updateLength = (key: "minLength" | "maxLength", rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    const next = Math.min(20, Math.max(3, parsed));
    if (key === "minLength") update({ minLength: Math.min(next, value.maxLength) });
    else update({ maxLength: Math.max(next, value.minLength) });
  };

  const languageOptions: Array<{ id: AdvancedNameLanguage; label: string }> = [
    { id: "auto", label: copy.auto },
    { id: "en", label: copy.english },
    { id: "sv", label: copy.swedish },
    { id: "mixed", label: copy.mixed },
  ];
  const styleOptions: Array<{ id: AdvancedNameStyle; label: string }> = [
    { id: "balanced", label: copy.balanced },
    { id: "brandable", label: copy.brandable },
    { id: "descriptive", label: copy.descriptive },
    { id: "invented", label: copy.invented },
  ];
  const presetLabels = [copy.short, copy.compact, copy.standard, copy.any];

  return (
    <fieldset className="mt-4 min-w-0 border-t border-border pt-4 [&_button]:min-w-0 [&_button]:py-2 [&_button]:[overflow-wrap:anywhere]" disabled={disabled}>
      <legend className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
        {copy.title}
      </legend>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-background p-3" aria-labelledby="advanced-length-title">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 id="advanced-length-title" className="text-xs font-semibold text-foreground">{copy.length}</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {ADVANCED_LENGTH_PRESETS.map((preset, index) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => update({ minLength: preset.minLength, maxLength: preset.maxLength })}
                disabled={disabled}
                aria-pressed={isPresetSelected(preset.minLength, preset.maxLength)}
                className={cn(
                  "min-h-9 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isPresetSelected(preset.minLength, preset.maxLength)
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {presetLabels[index]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              <span className="mb-1 block">{copy.min}</span>
              <Input type="number" min={3} max={20} value={value.minLength} onChange={(event) => updateLength("minLength", event.target.value)} className="h-9 text-sm" />
            </label>
            <label className="text-xs text-muted-foreground">
              <span className="mb-1 block">{copy.max}</span>
              <Input type="number" min={3} max={20} value={value.maxLength} onChange={(event) => updateLength("maxLength", event.target.value)} className="h-9 text-sm" />
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background p-3" aria-labelledby="advanced-language-title">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h3 id="advanced-language-title" className="text-xs font-semibold text-foreground">{copy.language}</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={copy.language}>
            {languageOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={value.nameLanguage === option.id}
                onClick={() => update({ nameLanguage: option.id })}
                disabled={disabled}
                className={cn(
                  "min-h-9 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  value.nameLanguage === option.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{copy.languageDetail}</p>

          <h3 className="mt-4 text-xs font-semibold text-foreground">{copy.style}</h3>
          <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label={copy.style}>
            {styleOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={value.nameStyle === option.id}
                onClick={() => update({ nameStyle: option.id })}
                disabled={disabled}
                className={cn(
                  "min-h-9 rounded-lg border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  value.nameStyle === option.id
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-foreground">
          <span className="mb-1.5 block">{copy.include}</span>
          <Input
            value={includeText}
            onChange={(event) => {
              const next = event.target.value;
              setIncludeText(next);
              update({ includeWords: normaliseCriteriaWords(next) });
            }}
            placeholder={copy.includePlaceholder}
            disabled={disabled}
            className="h-10 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-foreground">
          <span className="mb-1.5 block">{copy.exclude}</span>
          <Input
            value={excludeText}
            onChange={(event) => {
              const next = event.target.value;
              setExcludeText(next);
              update({ excludeWords: normaliseCriteriaWords(next) });
            }}
            placeholder={copy.excludePlaceholder}
            disabled={disabled}
            className="h-10 text-sm"
          />
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.helper}</p>
    </fieldset>
  );
};

export default AdvancedSearchCriteriaPanel;

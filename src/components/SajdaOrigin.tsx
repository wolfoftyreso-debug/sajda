import { ArrowRight, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import type { Language } from "@/i18n/LanguageProvider";

interface SajdaOriginProps {
  language: Language;
  className?: string;
}

const copy: Record<Language, { eyebrow: string; title: string; body: string; note: string; source: string }> = {
  en: {
    eyebrow: "Why Sajda",
    title: "For anyone looking for the right name.",
    body: "Sajda is named in tribute to Saida Andersson (1923–1998), the Swedish media figure from Boden who became known for helping people search for what had gone missing.",
    note: "Registry checks, transparent prices and a thoughtful way to find your name.",
    source: "Read the Sajda story",
  },
  sv: {
    eyebrow: "Varför Sajda",
    title: "För dig som letar efter rätt namn.",
    body: "Sajda har fått sitt namn som en hyllning till Saida Andersson (1923–1998), medieprofilen från Boden som blev känd för att hjälpa människor leta efter sådant som försvunnit.",
    note: "Kontroller hos domänregistret, tydliga priser och ett genomtänkt sätt att hitta namn.",
    source: "Läs berättelsen om Sajda",
  },
  es: {
    eyebrow: "Por qué Sajda",
    title: "Para quienes buscan el nombre adecuado.",
    body: "Sajda rinde homenaje a Saida Andersson (1923–1998), la figura mediática sueca de Boden conocida por ayudar a buscar cosas que se habían perdido.",
    note: "Comprobaciones del registro, precios transparentes y una búsqueda bien pensada.",
    source: "Leer la historia de Sajda",
  },
  fr: {
    eyebrow: "Pourquoi Sajda",
    title: "Pour trouver le nom qui vous correspond.",
    body: "Sajda rend hommage à Saida Andersson (1923–1998), personnalité suédoise de Boden connue pour aider les gens à retrouver ce qui avait disparu.",
    note: "Des vérifications auprès du registre, des prix transparents et une recherche réfléchie.",
    source: "Lire l’histoire de Sajda",
  },
  zh: {
    eyebrow: "为什么叫 Sajda",
    title: "帮你寻找真正合适的名称。",
    body: "Sajda 以瑞典博登的媒体人物 Saida Andersson（1923–1998）命名，以纪念她帮助人们寻找遗失之物的故事。",
    note: "向注册局核验、清晰展示价格，让名称搜索更有方向。",
    source: "阅读 Sajda 的故事",
  },
};

export default function SajdaOrigin({ language, className = "" }: SajdaOriginProps) {
  const content = copy[language];

  return (
    <details className={`group rounded-2xl border border-border/90 bg-card/80 px-4 py-3 shadow-sm ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Compass className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-primary">{content.eyebrow}</span>
            <span className="mt-0.5 block text-sm font-semibold text-foreground">{content.title}</span>
          </span>
        </span>
        <span className="text-xl leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <div className="ml-12 mt-3 space-y-2 border-l border-primary/20 pl-4 text-sm leading-6 text-muted-foreground">
        <p>{content.body}</p>
        <p className="font-medium text-foreground/85">{content.note}</p>
        <Link
          to="/story"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {content.source}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </details>
  );
}

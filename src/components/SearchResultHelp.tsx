import { useId, useRef, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import type { Language } from "@/i18n/LanguageProvider";

interface SearchResultHelpProps {
  language: Language;
  enabled?: boolean;
}
interface ResultHelpCopy {
  title: string;
  summary: string;
  sections: readonly { title: string; body: string }[];
}

const copy: Record<Language, ResultHelpCopy> = {
  sv: {
    title: "Så läser du resultaten",
    summary: "Tillgänglighet, priser och namnpoäng",
    sections: [
      { title: "Är domänen ledig?", body: "Ledig är ett registerbesked vid söktillfället, inte en bokning. Om statusen inte är bekräftad kunde kontrollen inte ge ett säkert besked. Bekräfta tillgängligheten hos leverantören före köp." },
      { title: "Vad betyder priset?", body: "Publicerat standardpris gäller ändelsen, inte en offert för just domänen. Saknas ett bekräftat pris visas inget uppskattat belopp. Kontrollera slutpris, förnyelse, moms och avgifter hos leverantören." },
      { title: "Vad mäter poängen?", body: "Domänkvalitet bedömer namnets egenskaper och hjälper dig jämföra förslagen. Poängen är inte ett marknadsvärde, en garanti eller ett besked om tillgänglighet." },
    ],
  },
  en: {
    title: "How to read the results",
    summary: "Availability, prices and name scores",
    sections: [
      { title: "Is the domain available?", body: "Available means the registry reported it as available when you searched. It is not a reservation. An unconfirmed status means the check could not give a definite answer. Confirm availability with the provider before buying." },
      { title: "What does the price mean?", body: "A published standard price applies to the extension, not to this specific domain. If there is no confirmed price, we do not show an estimate. Check the final price, renewal cost, tax and fees with the provider." },
      { title: "What does the score measure?", body: "Domain quality assesses the name's characteristics to help you compare suggestions. It is not a market valuation, a guarantee or an availability check." },
    ],
  },
  es: {
    title: "Cómo leer los resultados",
    summary: "Disponibilidad, precios y puntuaciones",
    sections: [
      { title: "¿Está disponible el dominio?", body: "Disponible significa que el registro lo indicó así al buscar; no es una reserva. Si el estado no está confirmado, la consulta no pudo dar una respuesta segura. Confirma la disponibilidad con el proveedor antes de comprar." },
      { title: "¿Qué significa el precio?", body: "El precio estándar publicado corresponde a la extensión, no es una oferta para el dominio exacto. Si falta un precio confirmado, no se muestra una estimación. Comprueba el precio final, la renovación, los impuestos y las tarifas con el proveedor." },
      { title: "¿Qué mide la puntuación?", body: "La calidad del dominio evalúa las características del nombre para comparar propuestas. No es una valoración de mercado, una garantía ni una comprobación de disponibilidad." },
    ],
  },
  fr: {
    title: "Comment lire les résultats",
    summary: "Disponibilité, prix et qualité des noms",
    sections: [
      { title: "Le domaine est-il disponible ?", body: "Disponible signifie que le registre l’indiquait comme tel lors de la recherche. Il ne s’agit pas d’une réservation. Un statut non confirmé signifie que la vérification n’a pas permis de conclure. Confirmez la disponibilité auprès du fournisseur avant l’achat." },
      { title: "Que signifie le prix ?", body: "Un prix standard publié concerne l'extension, pas le domaine exact. Sans prix confirmé, aucun montant estimé n'est affiché. Vérifiez le prix final, le renouvellement, les taxes et les frais auprès du fournisseur." },
      { title: "Que mesure le score ?", body: "La qualité du domaine évalue les caractéristiques du nom pour comparer les propositions. Ce n'est ni une estimation de marché, ni une garantie, ni une vérification de disponibilité." },
    ],
  },
  zh: {
    title: "如何理解搜索结果",
    summary: "可用状态、价格与名称评分",
    sections: [
      { title: "域名可以注册吗？", body: "可注册表示搜索时注册局返回了这一结果，并不代表已为你预留。状态未确认表示本次查询无法给出确定答案。购买前请向服务商再次确认。" },
      { title: "价格代表什么？", body: "已发布的标准价格适用于该后缀，并非该具体域名的报价。没有确认的价格时，不会显示估算金额。请向服务商确认最终价格、续费、税费及其他费用。" },
      { title: "评分衡量什么？", body: "域名质量根据名称的特点进行评估，帮助你比较建议。它不是市场估值、保证或可用性检查。" },
    ],
  },
};

function ResultHelp({ language }: Pick<SearchResultHelpProps, "language">) {
  const [isOpen, setIsOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const strings = copy[language];

  return (
    <aside
      className="mb-5 min-w-0 rounded-xl border border-border bg-background"
      aria-labelledby={`${id}-title`}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.stopPropagation();
        setIsOpen(false);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={isOpen}
        aria-controls={`${id}-content`}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-summary`}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Info className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className="block text-sm font-semibold text-foreground">{strings.title}</span>
          <span id={`${id}-summary`} className="mt-0.5 block text-xs leading-5 text-muted-foreground">{strings.summary}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground ${isOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      <div id={`${id}-content`} hidden={!isOpen}>
        <div className="grid gap-5 border-t border-border p-4 md:grid-cols-3 sm:p-5">
          {strings.sections.map((section) => (
            <section key={section.title} className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** Inline, user-controlled help: no overlay, timer, rotating notes or feed. */
export default function SearchResultHelp({ language, enabled = true }: SearchResultHelpProps) {
  return enabled ? <ResultHelp language={language} /> : null;
}

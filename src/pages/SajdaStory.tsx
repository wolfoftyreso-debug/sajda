import { useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ExternalLink, Search, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useLanguage, type Language } from "@/i18n/LanguageProvider";

type StoryCopy = {
  pageLabel: string;
  backToSearch: string;
  storyLabel: string;
  title: string;
  lead: string;
  disclosure: string;
  searchAction: string;
  portraitAlt: string;
  portraitFallback: string;
  portraitCaption: string;
  prologueLabel: string;
  prologueTitle: string;
  prologue: string;
  principle: string;
  principleByline: string;
  methodLabel: string;
  methodTitle: string;
  methodLinkLabel: string;
  methodLinkAria: string;
  methodItems: Array<{ title: string; body: string }>;
  distinctionLabel: string;
  factTitle: string;
  factBody: string;
  fictionTitle: string;
  fictionBody: string;
  sourcesTitle: string;
  svtSource: string;
  radioSource: string;
  ctaTitle: string;
  ctaBody: string;
  ctaAction: string;
};

const storyCopy: Record<Language, StoryCopy> = {
  en: {
    pageLabel: "The Sajda story",
    backToSearch: "Back to search",
    storyLabel: "An editorial prologue",
    title: "Every great name starts with an idea.",
    lead: "Sajda is a domain search tool named in tribute to Saida Andersson. Our brand story draws on the instinct to find what is missing and applies it to finding a name worth keeping.",
    disclosure: "A contemporary Sajda interpretation: the memoir, notes, and future-facing language describe our approach—not historical documents or promises.",
    searchAction: "Start a search",
    portraitAlt: "Black-and-white editorial portrait illustration for the Sajda story",
    portraitFallback: "Portrait unavailable",
    portraitCaption: "Portrait of Saida Andersson, Landvex",
    prologueLabel: "The Sajda memorandum",
    prologueTitle: "A note for the searchable world",
    prologue: "In Sajda’s editorial telling, a note in a memoir imagines a world crowded with names—and asks which ones will be found first. The answer is not magic: make the signal memorable, inspect the evidence, and act while the route is open.",
    principle: "“The rare thing is not the name. It is knowing why it matters before someone else does.”",
    principleByline: "— from the contemporary Sajda editorial",
    methodLabel: "From story to practice",
    methodTitle: "Find ideas. Check the facts.",
    methodLinkLabel: "Explore how it works",
    methodLinkAria: "Read how this part of Sajda works",
    methodItems: [
      { title: "Find a direction", body: "Turn an idea, a starting word or a detailed description into useful name suggestions." },
      { title: "Check the evidence", body: "Check domain availability with the registry and see where price information comes from." },
      { title: "Choose with context", body: "Compare providers, shortlist the strongest options, and make the final decision yourself." },
    ],
    distinctionLabel: "Story and facts",
    factTitle: "The historical reference",
    factBody: "Saida Andersson became a major Swedish television figure in the 1990s. SVT and Sveriges Radio describe her as a well-known “sierska” from Boden, associated with helping people look for lost items.",
    fictionTitle: "Our creative interpretation",
    fictionBody: "The book, memoir, and future-facing language are a contemporary Sajda interpretation. They describe our search practice, not biography, documentation, or a guarantee.",
    sourcesTitle: "Read the independent source material",
    svtSource: "SVT: Sierskan",
    radioSource: "Sveriges Radio: Saida Andersson",
    ctaTitle: "Find the one worth keeping.",
    ctaBody: "Bring a word, a hunch, or an exact domain. Sajda turns it into a clear next step—and shows the evidence behind it.",
    ctaAction: "Find your next name",
  },
  sv: {
    pageLabel: "Berättelsen om Sajda",
    backToSearch: "Tillbaka till sökningen",
    storyLabel: "En redaktionell prolog",
    title: "Varje bra namn börjar med en idé.",
    lead: "Sajda är ett verktyg för domänsökning, döpt som en hyllning till Saida Andersson. Vår berättelse utgår från viljan att hitta det som saknas och för över den till sökandet efter ett namn att behålla.",
    disclosure: "En nutida Sajda-tolkning: memoaren, anteckningarna och framtidsspråket beskriver vårt arbetssätt—inte historiska dokument eller löften.",
    searchAction: "Starta en sökning",
    portraitAlt: "Svartvit redaktionell porträttillustration för Sajdas berättelse",
    portraitFallback: "Porträttet kunde inte visas",
    portraitCaption: "Porträtt av Saida Andersson, Landvex",
    prologueLabel: "Sajda-memorandumet",
    prologueTitle: "En anteckning om en värld av namn",
    prologue: "I Sajdas redaktionella berättelse föreställer sig en rad i en memoar en värld full av namn—och frågar vilka som kommer att hittas först. Svaret är inte magi: gör signalen minnesvärd, granska underlaget och agera medan vägen är öppen.",
    principle: "“Det sällsynta är inte namnet. Det är att förstå varför det betyder något före någon annan.”",
    principleByline: "— ur Sajdas nutida redaktionella berättelse",
    methodLabel: "Från berättelse till praktik",
    methodTitle: "Hitta idéer. Kontrollera fakta.",
    methodLinkLabel: "Se hur det fungerar",
    methodLinkAria: "Läs hur den här delen av Sajda fungerar",
    methodItems: [
      { title: "Hitta en riktning", body: "Gör en idé, ett startord eller en detaljerad beskrivning till användbara namnförslag." },
      { title: "Kontrollera underlaget", body: "Kontrollera domäntillgänglighet hos domänregistret och se var prisuppgifterna kommer ifrån." },
      { title: "Välj med sammanhang", body: "Jämför leverantörer, samla de starkaste alternativen och fatta själv det slutliga beslutet." },
    ],
    distinctionLabel: "Berättelse och fakta",
    factTitle: "Den historiska referensen",
    factBody: "Saida Andersson blev en stor svensk tv-profil under 1990-talet. SVT och Sveriges Radio beskriver henne som den välkända sierskan från Boden, förknippad med att hjälpa människor leta efter borttappade saker.",
    fictionTitle: "Vår kreativa tolkning",
    fictionBody: "Boken, memoaren och framtidsspråket är en nutida Sajda-tolkning. De beskriver vårt sökarbete—inte biografi, dokumentation eller ett löfte.",
    sourcesTitle: "Läs det oberoende källmaterialet",
    svtSource: "SVT: Sierskan",
    radioSource: "Sveriges Radio: Saida Andersson",
    ctaTitle: "Hitta den som är värd att behålla.",
    ctaBody: "Börja med ett ord, en magkänsla eller en exakt domän. Sajda hjälper dig vidare och visar underlaget.",
    ctaAction: "Hitta ditt nästa namn",
  },
  es: {
    pageLabel: "La historia de Sajda",
    backToSearch: "Volver a la búsqueda",
    storyLabel: "Un prólogo editorial",
    title: "Todo buen nombre empieza con una idea.",
    lead: "Sajda es una herramienta de búsqueda de dominios cuyo nombre rinde homenaje a Saida Andersson. Nuestra historia parte del impulso de encontrar lo que falta y lo aplica a la búsqueda de un nombre que merezca conservarse.",
    disclosure: "Una interpretación contemporánea de Sajda: las memorias, notas y lenguaje de futuro describen nuestro enfoque, no documentos históricos ni promesas.",
    searchAction: "Iniciar una búsqueda",
    portraitAlt: "Ilustración de retrato editorial en blanco y negro para la historia de Sajda",
    portraitFallback: "No se pudo cargar el retrato",
    portraitCaption: "Retrato de Saida Andersson, Landvex",
    prologueLabel: "El memorando de Sajda",
    prologueTitle: "Una nota sobre un mundo lleno de nombres",
    prologue: "En el relato editorial de Sajda, una nota en unas memorias imagina un mundo lleno de nombres y pregunta cuáles se encontrarán primero. La respuesta no es magia: haz memorable la señal, revisa la evidencia y actúa mientras la ruta siga abierta.",
    principle: "“Lo raro no es el nombre. Es saber por qué importa antes que otra persona.”",
    principleByline: "— del relato contemporáneo de Sajda",
    methodLabel: "Del relato a la práctica",
    methodTitle: "Encuentra ideas. Comprueba los datos.",
    methodLinkLabel: "Ver cómo funciona",
    methodLinkAria: "Lee cómo funciona esta parte de Sajda",
    methodItems: [
      { title: "Encontrar una dirección", body: "Convierte una idea, una palabra inicial o una descripción detallada en sugerencias de nombres útiles." },
      { title: "Comprobar la evidencia", body: "Verifica la disponibilidad de dominios mediante fuentes de registro y muestra claramente el origen de los precios." },
      { title: "Elegir con contexto", body: "Compara proveedores, selecciona las mejores opciones y toma tú la decisión final." },
    ],
    distinctionLabel: "Relato y hechos",
    factTitle: "La referencia histórica",
    factBody: "Saida Andersson se convirtió en una importante figura televisiva sueca en los años noventa. SVT y Sveriges Radio la describen como la conocida “sierska” de Boden, asociada a ayudar a la gente a buscar objetos perdidos.",
    fictionTitle: "Nuestra interpretación creativa",
    fictionBody: "El libro, las memorias y el lenguaje de futuro son una interpretación contemporánea de Sajda. Describen nuestra práctica de búsqueda, no biografía, documentación ni garantía.",
    sourcesTitle: "Lee las fuentes independientes",
    svtSource: "SVT: Sierskan",
    radioSource: "Sveriges Radio: Saida Andersson",
    ctaTitle: "Encuentra el que merece conservarse.",
    ctaBody: "Empieza con una palabra, una intuición o un dominio concreto. Sajda te ayuda a dar el siguiente paso y muestra en qué se basa.",
    ctaAction: "Encuentra tu próximo nombre",
  },
  fr: {
    pageLabel: "L’histoire de Sajda",
    backToSearch: "Retour à la recherche",
    storyLabel: "Un prologue éditorial",
    title: "Tout bon nom commence par une idée.",
    lead: "Sajda est un outil de recherche de domaines dont le nom rend hommage à Saida Andersson. Notre récit s’inspire de l’envie de retrouver ce qui manque et l’applique à la recherche d’un nom à garder.",
    disclosure: "Une interprétation contemporaine de Sajda : les mémoires, notes et le langage tourné vers l’avenir décrivent notre approche, non des documents historiques ni des promesses.",
    searchAction: "Lancer une recherche",
    portraitAlt: "Illustration de portrait éditorial noir et blanc pour l’histoire de Sajda",
    portraitFallback: "Le portrait n’a pas pu être chargé",
    portraitCaption: "Portrait de Saida Andersson, Landvex",
    prologueLabel: "Le mémorandum Sajda",
    prologueTitle: "Une note sur un monde de noms",
    prologue: "Dans le récit éditorial de Sajda, une note dans des mémoires imagine un monde rempli de noms et demande lesquels seront trouvés les premiers. La réponse n’est pas magique : rendez le signal mémorable, examinez les preuves et agissez tant que la voie est ouverte.",
    principle: "« Ce qui est rare n’est pas le nom. C’est de savoir pourquoi il compte avant quelqu’un d’autre. »",
    principleByline: "— extrait du récit contemporain de Sajda",
    methodLabel: "Du récit à la pratique",
    methodTitle: "Trouvez des idées. Vérifiez les faits.",
    methodLinkLabel: "Voir comment cela fonctionne",
    methodLinkAria: "Découvrir le fonctionnement de cette partie de Sajda",
    methodItems: [
      { title: "Trouver une direction", body: "Transformez une idée, un mot de départ ou une description détaillée en suggestions de noms utiles." },
      { title: "Vérifier les preuves", body: "Vérifiez la disponibilité des domaines auprès de sources de registre et affichez clairement l’origine des prix." },
      { title: "Choisir en connaissance de cause", body: "Comparez les fournisseurs, établissez une sélection des meilleures options et prenez vous-même la décision finale." },
    ],
    distinctionLabel: "Récit et faits",
    factTitle: "La référence historique",
    factBody: "Saida Andersson est devenue une grande figure de la télévision suédoise dans les années 1990. SVT et Sveriges Radio la décrivent comme la célèbre « sierska » de Boden, associée à l’aide apportée aux personnes cherchant des objets perdus.",
    fictionTitle: "Notre interprétation créative",
    fictionBody: "Le livre, les mémoires et le langage tourné vers l’avenir sont une interprétation contemporaine de Sajda. Ils décrivent notre pratique de recherche, pas une biographie, une documentation ou une garantie.",
    sourcesTitle: "Lire les sources indépendantes",
    svtSource: "SVT : Sierskan",
    radioSource: "Sveriges Radio : Saida Andersson",
    ctaTitle: "Trouvez celui qui mérite d’être gardé.",
    ctaBody: "Partez d’un mot, d’une intuition ou d’un domaine précis. Sajda vous aide à avancer et vous montre sur quoi reposent les résultats.",
    ctaAction: "Trouver votre prochain nom",
  },
  zh: {
    pageLabel: "Sajda 的故事",
    backToSearch: "返回搜索",
    storyLabel: "品牌故事",
    title: "每个好名字，都从一个想法开始。",
    lead: "Sajda 是一款域名搜索工具，以 Saida Andersson 的名字为灵感向她致敬。我们的品牌故事将寻找失物的初心，延伸为寻找值得保留的名称。",
    disclosure: "这是 Sajda 的当代诠释：回忆录、笔记与面向未来的语言描述的是我们的工作方法，而非历史文献或承诺。",
    searchAction: "开始搜索",
    portraitAlt: "Sajda 品牌故事中的黑白肖像插画",
    portraitFallback: "肖像暂时无法显示",
    portraitCaption: "Saida Andersson 肖像，Landvex",
    prologueLabel: "Sajda 备忘录",
    prologueTitle: "关于一个充满名称的世界",
    prologue: "在 Sajda 创作的故事中，回忆录里的一则笔记描绘了一个充满名称的世界，并提出一个问题：哪些名字会先被发现？答案不是魔法，而是找到让人记住的名字，核查依据，并在机会仍在时行动。",
    principle: "“稀有的不是名字，而是在别人之前理解它为何重要。”",
    principleByline: "——摘自 Sajda 创作的品牌故事",
    methodLabel: "从故事到实践",
    methodTitle: "寻找灵感，核查事实。",
    methodLinkLabel: "了解工作原理",
    methodLinkAria: "了解 Sajda 此部分的工作方式",
    methodItems: [
      { title: "找到方向", body: "将想法、参考词或详细说明转化为真正可用的命名方向。" },
      { title: "核验依据", body: "通过注册局来源核验域名可用性，并清楚显示价格信息的来源。" },
      { title: "了解信息后再选择", body: "比较服务商，整理最合适的选项，最终由你自己作出决定。" },
    ],
    distinctionLabel: "故事与事实",
    factTitle: "历史参考",
    factBody: "Saida Andersson 在 1990 年代成为瑞典重要的电视人物。SVT 与 Sveriges Radio 将她描述为来自 Boden、广为人知的“sierska”，与帮助人们寻找遗失物品有关。",
    fictionTitle: "我们的创作诠释",
    fictionBody: "书、回忆录和面向未来的语言是 Sajda 的当代诠释。它们描述我们的搜索实践，而非传记、历史文献或保证。",
    sourcesTitle: "阅读独立来源材料",
    svtSource: "SVT：Sierskan",
    radioSource: "Sveriges Radio：Saida Andersson",
    ctaTitle: "找到值得保留的名称。",
    ctaBody: "从一个词、一点灵感或具体域名开始。Sajda 帮你理清下一步，并展示结果的依据。",
    ctaAction: "寻找你的下一个名称",
  },
};

const methodIcons = [Search, CheckCircle2, Scale] as const;
const methodLinks = ["/how-it-works#direction", "/how-it-works#evidence", "/how-it-works#context"] as const;

function PortraitFallback({ label }: { label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="relative grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-[1.75rem] border border-foreground/10 bg-card"
    >
      <span className="absolute inset-x-[18%] top-[13%] h-px bg-foreground/15" aria-hidden="true" />
      <span className="absolute inset-x-[18%] bottom-[13%] h-px bg-foreground/15" aria-hidden="true" />
      <span className="absolute bottom-[13%] top-[13%] left-[18%] w-px bg-foreground/15" aria-hidden="true" />
      <span className="absolute bottom-[13%] top-[13%] right-[18%] w-px bg-foreground/15" aria-hidden="true" />
      <img src="/sajda-mark.svg" alt="" className="h-20 w-20 opacity-80 grayscale contrast-150" />
    </div>
  );
}

export default function SajdaStory() {
  const { language } = useLanguage();
  const copy = storyCopy[language];
  const [showPortrait, setShowPortrait] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card">
        <div className="mx-auto flex min-h-[4.75rem] w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-7">
          <Link
            to="/"
            className="inline-flex shrink-0 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Sajda"
          >
            <img src="/sajda-logo.svg" alt="Sajda" className="h-7 w-auto sm:h-8" />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="hidden items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:inline-flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {copy.backToSearch}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden border-b border-border/80 bg-secondary/45">
          <span className="pointer-events-none absolute -right-28 -top-36 h-[31rem] w-[31rem] rounded-full border border-primary/15 bg-primary/[0.035]" aria-hidden="true" />
          <span className="pointer-events-none absolute left-[41%] top-16 h-40 w-40 rounded-full border border-primary/10" aria-hidden="true" />
          <span className="pointer-events-none absolute left-0 top-[45%] h-px w-1/3 bg-primary/15" aria-hidden="true" />

          <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-[minmax(0,1.16fr)_minmax(18rem,0.64fr)] lg:items-center lg:gap-16 lg:py-[5.5rem]">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-card/85 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary shadow-[0_8px_24px_hsl(219_44%_12%/0.045)]">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.storyLabel}
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{copy.pageLabel}</p>
              <h1 className="mt-3 max-w-[12ch] text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.055em] text-foreground sm:text-6xl">
                {copy.title}
              </h1>
              <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                {copy.lead}
              </p>
              <div className="mt-6 max-w-xl rounded-2xl border border-primary/15 bg-card/80 px-4 py-3.5 shadow-[0_10px_28px_hsl(219_44%_12%/0.045)] backdrop-blur-sm">
                <p className="text-sm leading-6 text-foreground/80">{copy.disclosure}</p>
              </div>
              <Button asChild size="lg" className="mt-8 shadow-[0_14px_26px_hsl(var(--primary)/0.18)]">
                <Link to="/">
                  {copy.searchAction}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>

            <figure className="relative mx-auto w-full max-w-[20rem] lg:justify-self-end">
              <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-primary/[0.08] px-5 pb-4 pt-7 shadow-[0_24px_60px_hsl(219_44%_12%/0.10)] backdrop-blur-sm">
                <span className="absolute -right-9 top-8 h-28 w-28 rounded-full border border-primary/25 bg-primary/[0.06]" aria-hidden="true" />
                <span className="absolute left-5 top-6 h-14 w-14 rounded-full border border-primary/20" aria-hidden="true" />
                <span className="absolute left-12 top-14 h-2 w-2 rounded-full bg-primary/70" aria-hidden="true" />
                <span className="absolute bottom-12 left-0 h-px w-full bg-primary/15" aria-hidden="true" />
                <span className="absolute bottom-6 right-6 h-10 w-10 rounded-full border border-primary/20" aria-hidden="true" />
                <div className="absolute inset-x-8 top-[35%] h-24 rounded-[1.25rem] border border-primary/10 bg-primary/[0.035]" aria-hidden="true" />
                <div className="relative z-10 mx-auto flex min-h-[18rem] items-end justify-center">
                  {showPortrait ? (
                    <img
                      src="/images/sajda-story-portrait-cutout.png"
                      alt={copy.portraitAlt}
                      onError={() => setShowPortrait(false)}
                      className="block h-[17rem] w-auto max-w-full object-contain object-bottom grayscale contrast-125 sm:h-[19rem] lg:h-[18rem]"
                    />
                  ) : (
                    <PortraitFallback label={copy.portraitFallback} />
                  )}
                </div>
                <figcaption className="relative z-10 mt-2 text-center text-xs leading-5 text-muted-foreground">{copy.portraitCaption}</figcaption>
              </div>
            </figure>
          </div>
        </section>

        <section className="border-b border-border/80 bg-card">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 sm:px-7 sm:py-16 lg:grid-cols-[minmax(0,0.82fr)_minmax(22rem,1.18fr)] lg:items-start lg:gap-16">
            <div className="relative overflow-hidden rounded-[1.5rem] border border-primary/15 bg-secondary/55 p-6 sm:p-7">
              <span className="absolute -right-9 -top-10 h-28 w-28 rounded-full border border-primary/20" aria-hidden="true" />
              <span className="absolute bottom-7 right-7 h-3 w-3 rounded-full bg-primary/75" aria-hidden="true" />
              <p className="relative text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.prologueLabel}</p>
              <h2 className="relative mt-3 max-w-[12ch] text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">{copy.prologueTitle}</h2>
            </div>
            <div className="max-w-2xl lg:pt-2">
              <p className="text-pretty text-base leading-8 text-muted-foreground sm:text-lg">{copy.prologue}</p>
              <blockquote className="mt-7 border-l-2 border-primary pl-5 text-lg font-medium leading-8 tracking-[-0.02em] text-foreground sm:text-xl">
                {copy.principle}
              </blockquote>
              <p className="mt-3 text-sm text-muted-foreground">{copy.principleByline}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.methodLabel}</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground sm:text-4xl">{copy.methodTitle}</h2>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-[1.25rem] border border-border bg-border sm:grid-cols-3">
            {copy.methodItems.map((item, index) => {
              const Icon = methodIcons[index];
              const methodLink = methodLinks[index] ?? "/how-it-works";
              return (
                <article key={item.title}>
                  <Link
                    to={methodLink}
                    aria-label={`${item.title}. ${copy.methodLinkAria}`}
                    className="group flex h-full flex-col bg-card p-6 transition-colors hover:bg-primary/5 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-7"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-6 text-base font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 group-hover:underline group-focus-visible:underline">
                      {copy.methodLinkLabel}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </Link>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-border/80 bg-secondary/45">
          <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-7 sm:py-16">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{copy.distinctionLabel}</p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <article className="rounded-[1.25rem] border border-border bg-card p-6 shadow-[0_1px_2px_hsl(219_44%_12%/0.035)] sm:p-7">
                <p className="text-sm font-semibold text-foreground">{copy.factTitle}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.factBody}</p>
              </article>
              <article className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-6 sm:p-7">
                <p className="text-sm font-semibold text-foreground">{copy.fictionTitle}</p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.fictionBody}</p>
              </article>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <span className="font-semibold text-foreground">{copy.sourcesTitle}</span>
              <a
                href="https://www.svtplay.se/video/ep3Xz71/sierskan"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {copy.svtSource}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <a
                href="https://www.sverigesradio.se/avsnitt/1742860"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {copy.radioSource}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-7 sm:py-16">
          <div className="flex flex-col justify-between gap-7 rounded-[1.5rem] border border-border bg-card p-7 shadow-[0_16px_40px_hsl(219_44%_12%/0.06)] sm:p-10 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <h2 className="text-balance text-3xl font-semibold tracking-[-0.04em] text-foreground">{copy.ctaTitle}</h2>
              <p className="mt-3 text-pretty text-base leading-7 text-muted-foreground">{copy.ctaBody}</p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to="/">
                {copy.ctaAction}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

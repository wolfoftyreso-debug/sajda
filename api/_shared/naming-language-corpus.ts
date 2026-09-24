import type { BrandNameLanguage } from "../../shared/name-languages.js";

export type AdditionalNameLanguage = Exclude<BrandNameLanguage, "en" | "sv">;
const split = (value: string) => value.split(" ");
type Translations = Record<AdditionalNameLanguage, string>;
const row = (fr: string, es: string, de: string, it: string, pt: string): Translations => ({ fr, es, de, it, pt });

/** Curated naming roots, not a machine-translation claim. Topic triggers include
 * all supported naming languages, so the brief and requested output can differ.
 * Unrecognised foreign input is never silently used as an English name root. */
const roots: Record<string, Translations> = {
  planning: row("plan cap rythme agenda jour elan repere", "plan rumbo ritmo agenda dia paso orden", "plan takt tag ziel zeit ordnung fokus", "piano ritmo agenda giorno passo ordine", "plano rumo ritmo agenda dia passo ordem"),
  finance: row("solde compte bilan epargne livre coffre", "saldo cuenta ahorro libro moneda valor", "saldo konto bilanz spar kasse wert", "saldo conto risparmio libro moneta valore", "saldo conta poupanca livro moeda valor"),
  design: row("forme toile cadre atelier ligne dessin", "forma lienzo marco taller trazo diseno", "form farbe rahmen werk linie bild", "forma tela cornice bottega linea disegno", "forma tela moldura oficina linha desenho"),
  wellbeing: row("soin repos souffle calme vie equilibre", "cuidado calma vida pulso salud descanso", "ruhe leben puls kraft pflege balance", "cura calma vita riposo salute respiro", "cuidado calma vida pulso saude descanso"),
  learning: row("savoir cours lecon plume ecole etude", "saber curso aula letra escuela estudio", "wissen kurs lern feder schule blick", "sapere corso aula scuola studio libro", "saber curso aula letra escola estudo"),
  food: row("table grain pain cuisine four saveur", "mesa grano pan cocina horno sabor", "tisch korn brot kueche ofen genuss", "tavola grano pane cucina forno gusto", "mesa grao pao cozinha forno sabor"),
  commerce: row("marche panier boutique colis rayon comptoir", "mercado cesta tienda envio estante pedido", "markt korb laden paket handel regal", "mercato cesto negozio pacco scaffale ordine", "mercado cesta loja envio prateleira pedido"),
  construction: row("pierre bois toit maison poutre ouvrage", "piedra madera techo casa viga obra", "stein holz dach haus balken werk", "pietra legno tetto casa trave opera", "pedra madeira teto casa viga obra"),
  nature: row("feuille bois racine terre jardin graine", "hoja bosque raiz tierra jardin semilla", "blatt wald wurzel erde garten saat", "foglia bosco radice terra giardino seme", "folha bosque raiz terra jardim semente"),
  technology: row("code donnee logique signal nuage calcul", "codigo dato logica senal nube calculo", "code daten logik signal wolke rechen", "codice dato logica segnale nuvola calcolo", "codigo dado logica sinal nuvem calculo"),
  security: row("garde coffre preuve cle abri veille", "guarda caja prueba llave amparo escudo", "wacht tresor schutz sicher schild hut", "guardia scrigno prova chiave riparo scudo", "guarda cofre prova chave abrigo escudo"),
  travel: row("route sentier voyage carte escale horizon", "ruta sendero viaje mapa rumbo destino", "weg pfad reise karte fern ziel", "via sentiero viaggio mappa rotta meta", "rota trilha viagem mapa rumo destino"),
  community: row("cercle equipe lien voisin rencontre partage", "circulo equipo lazo vecino encuentro union", "kreis team band nachbar treff gemeinsam", "cerchio squadra legame vicino incontro unione", "circulo equipe laco vizinho encontro uniao"),
};
const topics: Record<string, string> = {
  planning: "planification planning gestion tache calendrier productividad tarea horario planificacion organisation aufgabe kalender pianificazione attivita calendario planejamento tarefa calendario",
  finance: "finance comptabilite epargne facture contabilidad ahorro factura finanzen buchhaltung rechnung finanza contabilita fattura financas contabilidade fatura",
  design: "creation creatif graphisme photographie diseno creativo fotografia gestaltung kreativ fotografie disegno creativo fotografia desenho criativo fotografia",
  wellbeing: "sante soin bienetre sommeil salud cuidado bienestar sueno gesundheit pflege wohlbefinden schlaf salute cura benessere sonno saude cuidado bemestar sono",
  learning: "apprentissage education ecole apprendre aprendizaje educacion escuela lernen bildung schule apprendimento istruzione scuola aprendizagem educacao escola",
  food: "restaurant cuisine boulangerie cafe nourriture restaurante cocina panaderia comida kaffee baeckerei essen ristorante cucina panetteria cibo restaurante cozinha padaria comida",
  commerce: "boutique commerce magasin tienda comercio venta laden handel verkauf negozio commercio vendita loja comercio venda",
  construction: "construction batiment maison menuisier construccion edificio carpinteria bau bauen gebaeude schreiner costruzione edificio falegname construcao edificio carpinteiro",
  nature: "nature jardin durable ecologie foret naturaleza jardin sostenible ecologia bosque natur garten nachhaltig oekologie wald natura giardino sostenibile ecologia bosco natureza jardim sustentavel ecologia floresta",
  technology: "logiciel developpeur donnees automatisation codigo desarrollador datos tecnologia entwickler daten software automatisierung sviluppatore dati tecnologia codigo desenvolvedor dados tecnologia",
  security: "securite confidentialite protection seguridad privacidad proteccion sicherheit datenschutz schutz sicurezza riservatezza protezione seguranca privacidade protecao",
  travel: "voyage tourisme aventure viaje turismo aventura reise tourismus abenteuer viaggio turismo avventura viagem turismo aventura",
  community: "equipe communaute collaboration voisin equipo comunidad colaboracion vecino gemeinschaft zusammenarbeit nachbar squadra comunita collaborazione vicino equipe comunidade colaboracao vizinho",
};

const companions = row("rive atelier jardin elan lumiere voie repere cercle plume maison", "rio taller jardin impulso luz camino guia circulo pluma casa", "ufer werk garten schwung licht weg blick kreis feder haus", "riva bottega giardino slancio luce via guida cerchio piuma casa", "rio oficina jardim impulso luz caminho guia circulo pena casa");
// Prefer invariant forms or noun-led brand compounds instead of guessing the
// grammatical gender of an arbitrary root (e.g. "forme gai" / "tela vivo").
const modifiers = row("calme libre agile lumiere elan eclat", "suave libre feliz luz calma valor", "klar sanft ruhig hell fein frei", "dolce fine luce gioia slancio valore", "suave livre feliz luz calma valor");
const tools = row("guide carnet carte boussole tableau livre", "guia cuaderno mapa brujula tabla libro", "hilfe heft karte kompass tafel buch", "guida quaderno mappa bussola tavola libro", "guia caderno mapa bussola quadro livro");
const fallbackRoots = row("elan cap essor horizon lien idee", "impulso rumbo avance horizonte lazo idea", "schwung ziel aufbruch horizont band idee", "slancio rotta crescita orizzonte legame idea", "impulso rumo avanco horizonte laco ideia");
const toneRoots: Translations[] = [
  row("calme paisible tendre repos serenite", "suave dulce calma serenidad paz", "ruhig sanft still friedlich mild", "dolce mite calma serenita pace", "suave doce calma serenidade paz"),
  row("simple agile lumiere clarté purete", "simple luz claridad pureza aire", "klar rein schlicht pur leicht", "semplice lieve luce chiarezza aria", "simples leve luz clareza pureza"),
  row("joie sourire elan lumiere rire", "alegre feliz luz alegria color", "hell froh munter frisch neugier", "felice gioia luce sorriso brio", "alegre feliz luz alegria cor"),
  row("noble sobre prestige eclat elegance", "noble elegante prestigio lujo distincion", "fein edel erlesen elegant nobel", "fine nobile elegante prestigio stile", "nobre elegante prestigio luxo estilo"),
  row("nord bouleau pin ambre foret", "norte abedul pino ambar bosque", "nord birke kiefer bernstein wald", "nord betulla pino ambra bosco", "norte betula pinho ambar bosque"),
];
export const additionalLanguage = (value: BrandNameLanguage): value is AdditionalNameLanguage => value !== "en" && value !== "sv";
export const namingTopicTriggers = (id: string) => split(topics[id] ?? "").filter(Boolean);
export const namingTopicRoots = (id: string, language: AdditionalNameLanguage) => split((roots[id] ?? fallbackRoots)[language]);
export const namingCompanions = (language: AdditionalNameLanguage) => split(companions[language]);
export const namingModifiers = (language: AdditionalNameLanguage) => split(modifiers[language]);
export const namingTools = (language: AdditionalNameLanguage) => split(tools[language]);
export const namingFallbackRoots = (language: AdditionalNameLanguage) => split(fallbackRoots[language]);
export const namingToneRoots = (index: number, language: AdditionalNameLanguage) => split((toneRoots[index] ?? modifiers)[language]);

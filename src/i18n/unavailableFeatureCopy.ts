import type { Language } from "./languagePreference";

export type UnavailableFeature = "history" | "domains" | "ranking";

const copy: Record<Language, Record<UnavailableFeature, { title: string; body: string; action: string; secondary: string }>> = {
  en: {
    history: {
      title: "Search history is not kept",
      body: "This version does not store the domains you look up. A name you save from the results stays on your account. That list is a snapshot from when you saved it, not a search history.",
      action: "Open saved names",
      secondary: "Back to domain search",
    },
    domains: {
      title: "Owned domains are not stored here",
      body: "A portfolio of domains you already own is not available in this version. Names you save from search are kept on your account, with the status recorded at the time you saved them.",
      action: "Open saved names",
      secondary: "Back to domain search",
    },
    ranking: {
      title: "There is no published Top 10",
      body: "Sajda does not rank domains by an estimated value. A list here would be an unverified claim. Search a name to see registry status and prices that name their source.",
      action: "Back to domain search",
      secondary: "Open saved names",
    },
  },
  sv: {
    history: {
      title: "Sökhistorik sparas inte",
      body: "Den här versionen lagrar inte domänerna du slår upp. Ett namn du sparar från resultatet ligger kvar på kontot. Den listan är en ögonblicksbild från när du sparade, inte en sökhistorik.",
      action: "Öppna sparade namn",
      secondary: "Tillbaka till domänsökningen",
    },
    domains: {
      title: "Ägda domäner lagras inte här",
      body: "En portfölj över domäner du redan äger finns inte i den här versionen. Namn du sparar från sökningen ligger på kontot, med den status som gällde när du sparade dem.",
      action: "Öppna sparade namn",
      secondary: "Tillbaka till domänsökningen",
    },
    ranking: {
      title: "Det finns ingen publicerad topp 10",
      body: "Sajda rankar inte domäner efter ett uppskattat värde. En lista här skulle vara ett overifierat påstående. Sök ett namn för att se registerstatus och priser som anger sin källa.",
      action: "Tillbaka till domänsökningen",
      secondary: "Öppna sparade namn",
    },
  },
  es: {
    history: {
      title: "No se guarda el historial de búsqueda",
      body: "Esta versión no almacena los dominios que consultas. Un nombre que guardas desde los resultados permanece en tu cuenta. Esa lista es una instantánea del momento en que lo guardaste, no un historial de búsqueda.",
      action: "Abrir nombres guardados",
      secondary: "Volver a buscar dominios",
    },
    domains: {
      title: "Los dominios que ya posees no se guardan aquí",
      body: "Una cartera de dominios que ya posees no está disponible en esta versión. Los nombres que guardas desde la búsqueda permanecen en tu cuenta, con el estado registrado en el momento de guardarlos.",
      action: "Abrir nombres guardados",
      secondary: "Volver a buscar dominios",
    },
    ranking: {
      title: "No hay un Top 10 publicado",
      body: "Sajda no clasifica dominios por un valor estimado. Una lista aquí sería una afirmación no verificada. Busca un nombre para ver el estado en el registro y precios que indican su fuente.",
      action: "Volver a buscar dominios",
      secondary: "Abrir nombres guardados",
    },
  },
  fr: {
    history: {
      title: "L’historique de recherche n’est pas conservé",
      body: "Cette version n’enregistre pas les domaines que vous consultez. Un nom que vous enregistrez depuis les résultats reste sur votre compte. Cette liste est un instantané du moment de l’enregistrement, pas un historique de recherche.",
      action: "Ouvrir les noms enregistrés",
      secondary: "Retour à la recherche de domaines",
    },
    domains: {
      title: "Les domaines déjà possédés ne sont pas stockés ici",
      body: "Un portefeuille des domaines que vous possédez déjà n’est pas disponible dans cette version. Les noms enregistrés depuis la recherche restent sur votre compte, avec l’état constaté au moment de l’enregistrement.",
      action: "Ouvrir les noms enregistrés",
      secondary: "Retour à la recherche de domaines",
    },
    ranking: {
      title: "Il n’existe pas de top 10 publié",
      body: "Sajda ne classe pas les domaines selon une valeur estimée. Une liste ici serait une affirmation non vérifiée. Recherchez un nom pour voir l’état dans le registre et des prix qui indiquent leur source.",
      action: "Retour à la recherche de domaines",
      secondary: "Ouvrir les noms enregistrés",
    },
  },
  zh: {
    history: {
      title: "不保存搜索历史",
      body: "此版本不会存储你查询过的域名。你从结果中保存的名称会留在账户里。那份列表是保存当时的快照，不是搜索历史。",
      action: "打开已保存的名称",
      secondary: "返回域名搜索",
    },
    domains: {
      title: "已拥有的域名不在这里保存",
      body: "此版本没有你已经拥有的域名组合。你从搜索中保存的名称会留在账户里，并保留保存当时记录的状态。",
      action: "打开已保存的名称",
      secondary: "返回域名搜索",
    },
    ranking: {
      title: "没有已发布的前十名",
      body: "Sajda 不会按估算价值给域名排名。这里的名单会是未经核实的说法。搜索一个名称即可查看注册状态，以及标明来源的价格。",
      action: "返回域名搜索",
      secondary: "打开已保存的名称",
    },
  },
};

export function unavailableFeatureForPath(pathname: string): UnavailableFeature {
  if (pathname === "/history") return "history";
  if (pathname === "/my-domains") return "domains";
  return "ranking";
}

/** Saved names are the only account list these routes can honestly open. */
export function unavailableFeatureView(language: Language, pathname: string) {
  const feature = unavailableFeatureForPath(pathname);
  const text = copy[language][feature];
  const savedFirst = feature !== "ranking";
  return {
    ...text,
    actionHref: savedFirst ? "/watchlist" : "/",
    secondaryHref: savedFirst ? "/" : "/watchlist",
  };
}

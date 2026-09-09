import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Bookmark,
  Check,
  ExternalLink,
  Filter,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  formatRegistrarOfferPrice,
  getRegistrarFxDisclosure,
  getRegistrarOfferTerms,
  getRegistrationPrice,
  normaliseRegistrarOffer,
} from "@/lib/registrarOffer";
import { useReferenceFx } from "@/hooks/useReferenceFx";
import {
  swipeWishlistCategories,
  type SwipeWishlistCategory,
  type SwipeWishlistEntry,
} from "@/lib/swipeWishlist";

type WishlistLanguage = "en" | "sv" | "es" | "fr" | "zh";
type WishlistSort = "recent" | "alphabetical" | "checked";

const MAX_REFRESH_BATCH = 12;

const wishlistMessages = {
  en: {
    trigger: "Saved",
    triggerLabel: "Open saved names",
    title: "Saved names",
    description: "A private, persistent list in this browser. Keep organising while you explore.",
    storedHere: "Stored on this device",
    search: "Filter names or tags",
    category: "Category",
    allCategories: "All categories",
    sort: "Sort",
    recent: "Recently saved",
    alphabetical: "Name A–Z",
    checked: "Recently checked",
    refresh: "Refresh checks",
    refreshing: "Refreshing checks…",
    refreshHelp: "Refreshes the first {count} names matching the current filters.",
    emptyTitle: "Nothing saved yet",
    emptyDescription: "Keep a domain and it will stay here on this device until you remove it.",
    noMatches: "No saved domains match your filters",
    clearFilters: "Clear filters",
    clear: "Clear list",
    remove: "Remove",
    addTag: "Add a tag",
    add: "Add",
    categoryShortlist: "Shortlist",
    categoryBrand: "Brand direction",
    categoryWatch: "Watch",
    categoryLater: "Later",
    available: "Available at last check",
    taken: "Taken at last check",
    unknown: "Availability unresolved",
    provider: "Provider",
    priceUnavailable: "Price unavailable",
    openProvider: "Open provider",
    savedOn: "Saved {date}",
    checkedOn: "Checked {date}",
    removeTag: "Remove tag {tag}",
    deleteName: "Remove {domain} from saved names",
    visibleCount: "{count} shown",
  },
  sv: {
    trigger: "Sparade",
    triggerLabel: "Öppna sparade namn",
    title: "Sparade namn",
    description: "En privat, beständig lista i den här webbläsaren. Organisera medan du utforskar.",
    storedHere: "Sparas på den här enheten",
    search: "Filtrera namn eller taggar",
    category: "Kategori",
    allCategories: "Alla kategorier",
    sort: "Sortera",
    recent: "Senast sparade",
    alphabetical: "Namn A–Ö",
    checked: "Senast kontrollerade",
    refresh: "Uppdatera kontroller",
    refreshing: "Uppdaterar kontroller…",
    refreshHelp: "Kontrollerar de första {count} namnen som matchar dina aktuella filter.",
    emptyTitle: "Inget sparat ännu",
    emptyDescription: "Behåll en domän så ligger den kvar på den här enheten tills du tar bort den.",
    noMatches: "Inga sparade domäner matchar dina filter",
    clearFilters: "Rensa filter",
    clear: "Rensa listan",
    remove: "Ta bort",
    addTag: "Lägg till tagg",
    add: "Lägg till",
    categoryShortlist: "Kortlista",
    categoryBrand: "Varumärkesriktning",
    categoryWatch: "Bevaka",
    categoryLater: "Senare",
    available: "Ledig vid senaste kontrollen",
    taken: "Upptagen vid senaste kontrollen",
    unknown: "Tillgänglighet ej klarlagd",
    provider: "Leverantör",
    priceUnavailable: "Pris saknas",
    openProvider: "Öppna leverantör",
    savedOn: "Sparad {date}",
    checkedOn: "Kontrollerad {date}",
    removeTag: "Ta bort taggen {tag}",
    deleteName: "Ta bort {domain} från sparade namn",
    visibleCount: "{count} visas",
  },
  es: {
    trigger: "Guardados",
    triggerLabel: "Abrir nombres guardados",
    title: "Nombres guardados",
    description: "Una lista privada y persistente en este navegador. Organízala mientras exploras.",
    storedHere: "Guardado en este dispositivo",
    search: "Filtrar nombres o etiquetas",
    category: "Categoría",
    allCategories: "Todas las categorías",
    sort: "Ordenar",
    recent: "Guardados recientemente",
    alphabetical: "Nombre A–Z",
    checked: "Comprobados recientemente",
    refresh: "Actualizar comprobaciones",
    refreshing: "Actualizando comprobaciones…",
    refreshHelp: "Actualiza los primeros {count} nombres que coinciden con los filtros actuales.",
    emptyTitle: "Aún no hay nombres guardados",
    emptyDescription: "Guarda un dominio y permanecerá en este dispositivo hasta que lo elimines.",
    noMatches: "Ningún dominio guardado coincide con los filtros",
    clearFilters: "Borrar filtros",
    clear: "Borrar lista",
    remove: "Eliminar",
    addTag: "Añadir etiqueta",
    add: "Añadir",
    categoryShortlist: "Preselección",
    categoryBrand: "Dirección de marca",
    categoryWatch: "Seguir",
    categoryLater: "Más tarde",
    available: "Disponible en la última comprobación",
    taken: "Ocupado en la última comprobación",
    unknown: "Disponibilidad sin resolver",
    provider: "Proveedor",
    priceUnavailable: "Precio no disponible",
    openProvider: "Abrir proveedor",
    savedOn: "Guardado {date}",
    checkedOn: "Comprobado {date}",
    removeTag: "Eliminar etiqueta {tag}",
    deleteName: "Eliminar {domain} de nombres guardados",
    visibleCount: "{count} mostrados",
  },
  fr: {
    trigger: "Enregistrés",
    triggerLabel: "Ouvrir les noms enregistrés",
    title: "Noms enregistrés",
    description: "Une liste privée et persistante dans ce navigateur. Organisez-la pendant votre exploration.",
    storedHere: "Enregistré sur cet appareil",
    search: "Filtrer les noms ou les étiquettes",
    category: "Catégorie",
    allCategories: "Toutes les catégories",
    sort: "Trier",
    recent: "Ajoutés récemment",
    alphabetical: "Nom A–Z",
    checked: "Vérifiés récemment",
    refresh: "Actualiser les vérifications",
    refreshing: "Actualisation des vérifications…",
    refreshHelp: "Actualise les {count} premiers noms correspondant aux filtres actuels.",
    emptyTitle: "Aucun nom enregistré",
    emptyDescription: "Gardez un domaine : il restera sur cet appareil jusqu’à sa suppression.",
    noMatches: "Aucun domaine enregistré ne correspond aux filtres",
    clearFilters: "Effacer les filtres",
    clear: "Effacer la liste",
    remove: "Supprimer",
    addTag: "Ajouter une étiquette",
    add: "Ajouter",
    categoryShortlist: "Présélection",
    categoryBrand: "Direction de marque",
    categoryWatch: "Suivre",
    categoryLater: "Plus tard",
    available: "Disponible lors de la dernière vérification",
    taken: "Pris lors de la dernière vérification",
    unknown: "Disponibilité non résolue",
    provider: "Fournisseur",
    priceUnavailable: "Prix indisponible",
    openProvider: "Ouvrir le fournisseur",
    savedOn: "Enregistré {date}",
    checkedOn: "Vérifié {date}",
    removeTag: "Supprimer l’étiquette {tag}",
    deleteName: "Supprimer {domain} des noms enregistrés",
    visibleCount: "{count} affichés",
  },
  zh: {
    trigger: "已保存",
    triggerLabel: "打开已保存名称",
    title: "已保存名称",
    description: "仅保存在此浏览器中的私有持久列表。探索时也可持续整理。",
    storedHere: "保存在此设备上",
    search: "筛选名称或标签",
    category: "分类",
    allCategories: "全部分类",
    sort: "排序",
    recent: "最近保存",
    alphabetical: "名称 A–Z",
    checked: "最近检查",
    refresh: "刷新检查",
    refreshing: "正在刷新检查…",
    refreshHelp: "刷新当前筛选结果中的前 {count} 个名称。",
    emptyTitle: "尚未保存名称",
    emptyDescription: "保留一个域名，它会留在此设备上，直到你将其移除。",
    noMatches: "没有已保存的域名符合筛选条件",
    clearFilters: "清除筛选条件",
    clear: "清空列表",
    remove: "移除",
    addTag: "添加标签",
    add: "添加",
    categoryShortlist: "候选清单",
    categoryBrand: "品牌方向",
    categoryWatch: "关注",
    categoryLater: "稍后",
    available: "上次检查时可用",
    taken: "上次检查时已被占用",
    unknown: "可用性未确定",
    provider: "服务商",
    priceUnavailable: "价格不可用",
    openProvider: "打开服务商",
    savedOn: "保存于 {date}",
    checkedOn: "检查于 {date}",
    removeTag: "移除标签 {tag}",
    deleteName: "从已保存名称中移除 {domain}",
    visibleCount: "显示 {count} 个",
  },
} as const;

type WishlistCopy = (typeof wishlistMessages)[WishlistLanguage];

function withValue(template: string, value: string | number): string {
  return template.replace(/\{(?:count|date|tag|domain)\}/gu, String(value));
}

function categoryLabel(category: SwipeWishlistCategory, copy: WishlistCopy): string {
  const labels: Record<SwipeWishlistCategory, string> = {
    shortlist: copy.categoryShortlist,
    brand: copy.categoryBrand,
    watch: copy.categoryWatch,
    later: copy.categoryLater,
  };
  return labels[category];
}

function statusLabel(status: SwipeWishlistEntry["result"]["status"], copy: WishlistCopy): string {
  if (status === "available") return copy.available;
  if (status === "taken") return copy.taken;
  return copy.unknown;
}

function dateLocale(language: WishlistLanguage): string {
  if (language === "sv") return "sv-SE";
  if (language === "es") return "es-ES";
  if (language === "fr") return "fr-FR";
  if (language === "zh") return "zh-CN";
  return "en-SE";
}

function formatDate(value: string, language: WishlistLanguage): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(dateLocale(language), {
    day: "numeric",
    month: "short",
  }).format(date);
}

function getCopy(language: string): WishlistCopy {
  if (language === "sv" || language === "es" || language === "fr" || language === "zh") {
    return wishlistMessages[language];
  }
  return wishlistMessages.en;
}

export interface SwipeWishlistPanelProps {
  items: SwipeWishlistEntry[];
  language: string;
  isRefreshing?: boolean;
  onRefresh: (domains: string[]) => void | Promise<void>;
  onUpdate: (domain: string, update: Partial<Pick<SwipeWishlistEntry, "category" | "tags">>) => void;
  onRemove: (domain: string) => void;
  onClear: () => void;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

/**
 * A browser-local companion to Swipe. The surface deliberately says that it
 * is local: actual account watchlists use their own authenticated service.
 */
export function SwipeWishlistPanel({
  items,
  language,
  isRefreshing = false,
  onRefresh,
  onUpdate,
  onRemove,
  onClear,
  onOpenChange,
  className,
}: SwipeWishlistPanelProps) {
  const copy = getCopy(language);
  const [isOpen, setIsOpen] = useState(false);
  const referenceFx = useReferenceFx(isOpen && items.length > 0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SwipeWishlistCategory | "all">("all");
  const [sort, setSort] = useState<WishlistSort>("recent");
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!normalizedQuery) return true;
      return item.domain.toLocaleLowerCase().includes(normalizedQuery)
        || item.tags.some((tag) => tag.toLocaleLowerCase().includes(normalizedQuery));
    });

    return [...filtered].sort((left, right) => {
      if (sort === "alphabetical") return left.domain.localeCompare(right.domain);
      if (sort === "checked") return right.lastCheckedAt.localeCompare(left.lastCheckedAt);
      return right.savedAt.localeCompare(left.savedAt);
    });
  }, [category, items, query, sort]);

  const refreshDomains = visible.slice(0, MAX_REFRESH_BATCH).map((item) => item.domain);

  const addTag = (item: SwipeWishlistEntry) => {
    const nextTag = tagDrafts[item.domain]?.trim();
    if (!nextTag) return;
    onUpdate(item.domain, { tags: [...item.tags, nextTag] });
    setTagDrafts((previous) => ({ ...previous, [item.domain]: "" }));
  };

  const onTagKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>, item: SwipeWishlistEntry) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addTag(item);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(nextOpen) => {
      setIsOpen(nextOpen);
      onOpenChange?.(nextOpen);
    }}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("relative shrink-0 border-border bg-card/90 shadow-sm", className)}
          aria-label={`${copy.triggerLabel} (${items.length})`}
        >
          <Bookmark className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{copy.trigger}</span>
          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
            {items.length}
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="left-auto right-0 top-0 h-[100dvh] w-full max-w-[34rem] translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-border bg-background p-0 shadow-2xl sm:rounded-none">
        <DialogHeader className="border-b border-border bg-card px-5 py-5 pr-14 text-left">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bookmark className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-xl text-foreground">{copy.title} <span className="text-muted-foreground">({items.length})</span></DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-5">{copy.description}</DialogDescription>
            </div>
          </div>
          <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
            {copy.storedHere}
          </p>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col bg-background">
          <div className="border-b border-border bg-card/65 px-5 py-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.search}
                aria-label={copy.search}
                className="border-border bg-background pl-9"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5"><Filter className="h-3.5 w-3.5" aria-hidden="true" />{copy.category}</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as SwipeWishlistCategory | "all")}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="all">{copy.allCategories}</option>
                  {swipeWishlistCategories.map((value) => <option key={value} value={value}>{categoryLabel(value, copy)}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                <span>{copy.sort}</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as WishlistSort)}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="recent">{copy.recent}</option>
                  <option value="alphabetical">{copy.alphabetical}</option>
                  <option value="checked">{copy.checked}</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{withValue(copy.visibleCount, visible.length)}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { void onRefresh(refreshDomains); }}
                disabled={refreshDomains.length === 0 || isRefreshing}
                className="border-primary/25 bg-background text-primary hover:bg-primary/5 hover:text-primary"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} aria-hidden="true" />
                {isRefreshing ? copy.refreshing : copy.refresh}
              </Button>
            </div>
            {refreshDomains.length > 0 && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{withValue(copy.refreshHelp, refreshDomains.length)}</p>}
          </div>

          {items.length > 0 && (
            <div className="flex items-center justify-end border-b border-border bg-card/40 px-5 py-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.clear}
              </Button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {visible.length > 0 ? (
              <ul className="space-y-3" aria-label={copy.title}>
                {visible.map((item) => {
                  const offer = normaliseRegistrarOffer(item.domain, item.result.registrarOffer);
                  const registration = getRegistrationPrice(offer);
                  const tone = item.result.status === "available"
                    ? "border-success/20 bg-success/10 text-success"
                    : item.result.status === "taken"
                      ? "border-destructive/20 bg-destructive/10 text-destructive"
                      : "border-border bg-secondary text-muted-foreground";

                  return (
                    <li key={item.domain} className="rounded-2xl border border-border bg-card p-4 shadow-[0_8px_22px_hsl(0_0%_12%/0.04)]">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold tracking-[-0.015em] text-foreground">{item.domain}</h3>
                          <p className="mt-1 text-[11px] text-muted-foreground">{withValue(copy.savedOn, formatDate(item.savedAt, language as WishlistLanguage))} · {withValue(copy.checkedOn, formatDate(item.lastCheckedAt, language as WishlistLanguage))}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(item.domain)}
                          aria-label={withValue(copy.deleteName, item.domain)}
                          title={copy.remove}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", tone)}>{statusLabel(item.result.status, copy)}</span>
                        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{copy.provider}: {offer.registrar}</span>
                        {registration && <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground">{formatRegistrarOfferPrice(registration.amount, offer.currency, language as WishlistLanguage, referenceFx)}</span>}
                      </div>
                      {registration && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{getRegistrarOfferTerms(offer, language as WishlistLanguage)}</p>}
                      {registration && offer.currency !== "USD" && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{getRegistrarFxDisclosure(registration.amount, offer.currency, language as WishlistLanguage, referenceFx)}</p>}

                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
                          <span>{copy.category}</span>
                          <select
                            value={item.category}
                            onChange={(event) => onUpdate(item.domain, { category: event.target.value as SwipeWishlistCategory })}
                            className="h-9 min-w-0 rounded-lg border border-border bg-background px-2 text-sm font-medium text-foreground outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {swipeWishlistCategories.map((value) => <option key={value} value={value}>{categoryLabel(value, copy)}</option>)}
                          </select>
                        </label>
                        <a
                          href={offer.purchaseUrl || undefined}
                          aria-disabled={!offer.purchaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-auto inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-primary/25 bg-primary/5 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {copy.openProvider}
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </div>

                      <div className="mt-3">
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((tag) => (
                            <span key={tag.toLocaleLowerCase()} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 py-1 pl-2 pr-1 text-[11px] font-semibold text-primary">
                              <Tag className="h-3 w-3" aria-hidden="true" />
                              {tag}
                              <button
                                type="button"
                                onClick={() => onUpdate(item.domain, { tags: item.tags.filter((existingTag) => existingTag !== tag) })}
                                aria-label={withValue(copy.removeTag, tag)}
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <X className="h-3 w-3" aria-hidden="true" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Input
                            value={tagDrafts[item.domain] ?? ""}
                            onChange={(event) => setTagDrafts((previous) => ({ ...previous, [item.domain]: event.target.value }))}
                            onKeyDown={(event) => onTagKeyDown(event, item)}
                            placeholder={copy.addTag}
                            aria-label={`${copy.addTag} ${item.domain}`}
                            className="h-8 border-border bg-background text-xs"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => addTag(item)} className="h-8 shrink-0 px-2.5 text-xs">
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            {copy.add}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-7 text-center">
                <Bookmark className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-foreground">{items.length > 0 ? copy.noMatches : copy.emptyTitle}</h3>
                {items.length > 0 ? <Button type="button" variant="outline" className="mt-3" onClick={() => { setQuery(""); setCategory("all"); }}>{copy.clearFilters}</Button> : <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{copy.emptyDescription}</p>}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SwipeWishlistPanel;

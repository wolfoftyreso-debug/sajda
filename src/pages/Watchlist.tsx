import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, ArrowLeft, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import DomainCard from "@/components/DomainCard";
import { useAuth } from "@/contexts/AuthContext";
import { getWatchlist, removeFromWatchlist } from "@/lib/watchlistService";
import { useToast } from "@/hooks/use-toast";
import { WatchlistPageSkeleton } from "@/components/PageSkeletons";
import { useLanguage } from "@/i18n/LanguageProvider";

interface WatchlistDomain {
  id: string;
  domain: string;
  registrar_price: number;
  estimated_value: number;
  confidence_score: number;
  rationale: string | null;
  created_at: string;
}

const Watchlist = () => {
  const [domains, setDomains] = useState<WatchlistDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removingDomain, setRemovingDomain] = useState<string | null>(null);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const accountId = user?.id ?? null;
  const currentAccountId = useRef(accountId);
  currentAccountId.current = accountId;
  const activeRead = useRef<AbortController | null>(null);
  const accountLifetime = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const isSwedish = language === "sv";

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const loadWatchlist = useCallback(async () => {
    activeRead.current?.abort();
    if (!accountId) return;
    const controller = new AbortController();
    activeRead.current = controller;
    const isCurrent = () => !controller.signal.aborted && currentAccountId.current === accountId;
    setLoading(true);
    setLoadFailed(false);
    try {
      const data = await getWatchlist({ accountId, signal: controller.signal });
      if (!isCurrent()) return;
      setDomains(data);
      setLoadedAccountId(accountId);
    } catch (err) {
      if (!isCurrent()) return;
      setLoadFailed(true);
      setLoadedAccountId(accountId);
      console.error("Failed to load watchlist:", err);
      toast({
        title: isSwedish ? "Kunde inte ladda bevakningslistan" : "Could not load watchlist",
        description: isSwedish ? "Försök igen senare." : "Please try again later.",
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [accountId, isSwedish, toast]);

  useEffect(() => {
    setDomains([]);
    setLoadedAccountId(null);
    setRemovingDomain(null);
    const lifetime = new AbortController();
    accountLifetime.current = lifetime;
    void loadWatchlist();
    return () => {
      lifetime.abort();
      activeRead.current?.abort();
    };
  }, [loadWatchlist]);

  const handleRemove = async (domain: string) => {
    if (!accountId || !accountLifetime.current) return;
    const signal = accountLifetime.current.signal;
    const isCurrent = () => !signal.aborted && currentAccountId.current === accountId;
    setRemovingDomain(domain);
    try {
      await removeFromWatchlist(domain, { accountId, signal });
      if (!isCurrent()) return;
      setDomains((prev) => prev.filter((d) => d.domain !== domain));
      toast({
        title: isSwedish ? "Borttagen från bevakningslistan" : "Removed from watchlist",
        description: isSwedish ? `${domain} har tagits bort.` : `${domain} has been removed.`,
      });
    } catch (err) {
      if (!isCurrent()) return;
      toast({
        title: isSwedish ? "Kunde inte ta bort" : "Could not remove",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Försök igen." : "Please try again.",
        variant: "destructive",
      });
    } finally {
      if (isCurrent()) setRemovingDomain(null);
    }
  };

  if (authLoading || loading || !accountId || loadedAccountId !== accountId) {
    return <WatchlistPageSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              className="text-muted-foreground hover:text-foreground"
              aria-label={isSwedish ? "Till startsidan" : "Go to home"}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Bookmark className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">
                  {isSwedish ? "Min bevakningslista" : "My watchlist"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {isSwedish
                    ? `${domains.length} domän${domains.length !== 1 ? "er" : ""} sparade`
                    : `${domains.length} saved domain${domains.length !== 1 ? "s" : ""}`}
                </p>
              </div>
            </div>
          </div>

        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        {loadFailed ? (
          <section className="rounded-2xl border border-destructive/20 bg-card p-6" role="alert">
            <h2 className="font-semibold">{isSwedish ? "Dina sparade domäner kunde inte hämtas" : "Your saved domains could not be loaded"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{isSwedish ? "Det betyder inte att listan är tom. Inga sparade domäner har ändrats." : "This does not mean your list is empty. No saved domains have been changed."}</p>
            <Button className="mt-4" variant="outline" onClick={() => void loadWatchlist()}><RefreshCw className="h-4 w-4" />{isSwedish ? "Försök igen" : "Try again"}</Button>
          </section>
        ) : domains.length > 0 ? (
          <div className="space-y-4">
            <p className="rounded-2xl border border-warning/20 bg-warning/[0.07] px-4 py-3 text-sm leading-6 text-foreground">
              {t("watchlist.availabilityNotice")}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {domains.map((domain, index) => (
                <div
                  key={domain.id}
                  className="animate-in fade-in slide-in-from-bottom-4"
                  style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
                >
                  <DomainCard
                    domain={domain.domain}
                    // Watchlist rows only persist the saved snapshot; they do
                    // not contain a current availability check. Never turn a
                    // saved domain into a green availability claim on reload.
                    status="unknown"
                    checkMethod="none"
                    availabilityVerified={false}
                    registrarPrice={domain.registrar_price}
                    estimatedValue={domain.estimated_value}
                    confidenceScore={domain.confidence_score}
                    rationale={domain.rationale || ""}
                    isInWatchlist={true}
                    onRemoveFromWatchlist={() => handleRemove(domain.domain)}
                    isSaving={removingDomain === domain.domain}
                    showWatchlistActions={true}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Bookmark className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              {isSwedish ? "Inga domäner sparade ännu" : "No saved domains yet"}
            </h3>
            <p className="mb-6 max-w-md text-sm text-muted-foreground">
              {isSwedish
                ? "Börja upptäcka domäner och spara de bästa möjligheterna till din bevakningslista."
                : "Start discovering domains and save the strongest opportunities to your watchlist."}
            </p>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Search className="h-4 w-4" />
              {isSwedish ? "Upptäck domäner" : "Discover domains"}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Watchlist;

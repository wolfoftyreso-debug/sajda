import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { History, Trash2, ExternalLink, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import FooterNav from "@/components/FooterNav";
import { getDomainHistory, clearDomainHistory, type DomainHistoryItem } from "@/lib/historyService";
import { SearchHistoryPageSkeleton } from "@/components/PageSkeletons";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedCurrency, formatLocalizedDateTime, formatLocalizedNumber } from "@/lib/localeFormat";

const SearchHistory = () => {
  const [domains, setDomains] = useState<DomainHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { language } = useLanguage();
  const isSwedish = language === "sv";

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getDomainHistory();
      setDomains(data);
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte ladda historik" : "Could not load history",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSwedish, toast]);

  useEffect(() => {
    if (user) {
      void loadHistory();
    }
  }, [user, loadHistory]);

  const handleClearHistory = async () => {
    try {
      await clearDomainHistory();
      setDomains([]);
      toast({
        title: isSwedish ? "Historik rensad" : "History cleared",
        description: isSwedish ? "Din sökhistorik har rensats" : "Your search history has been cleared",
      });
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte rensa historik" : "Could not clear history",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    }
  };

  if (authLoading || loading) {
    return (
      <>
        <SearchHistoryPageSkeleton />
        <FooterNav />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <History className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">
                {isSwedish ? "Mina sökningar" : "My searches"}
              </h1>
              <p className="text-xs text-muted-foreground">
                {isSwedish ? `${domains.length} domäner` : `${domains.length} domains`}
              </p>
            </div>
          </div>

          {domains.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearHistory}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              {isSwedish ? "Rensa" : "Clear"}
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-6 py-6">
        {domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <History className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              {isSwedish ? "Ingen historik ännu" : "No history yet"}
            </h2>
            <p className="mb-6 max-w-sm text-muted-foreground">
              {isSwedish ? "Dina sökresultat sparas här automatiskt" : "Your search results are saved here automatically"}
            </p>
            <Button
              onClick={() => navigate("/")}
              className="gap-2 bg-primary text-primary-foreground"
            >
              {isSwedish ? "Starta en sökning" : "Start a search"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {domains.map((domain) => {
              const multiple = domain.registrar_price > 0
                ? domain.estimated_value / domain.registrar_price
                : null;
              
              return (
                <div
                  key={domain.id}
                  className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-semibold text-foreground">
                          {domain.domain}
                        </h3>
                        <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                          .{domain.tld}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm">
                        <span className="text-muted-foreground">
                          {isSwedish ? "Prisestimat" : "Price estimate"}: <span className="text-foreground">{`≈ ${formatLocalizedCurrency(domain.registrar_price, "USD", language)}`}</span>
                        </span>
                        <span className="text-muted-foreground">
                          {isSwedish ? "Screeningvärde" : "Screening value"}: <span className="text-success">{`≈ ${formatLocalizedCurrency(domain.estimated_value, "USD", language)}`}</span>
                        </span>
                        <span className="flex items-center gap-1 text-primary">
                          <TrendingUp className="h-3.5 w-3.5" />
                          {multiple === null
                            ? "—"
                            : `${formatLocalizedNumber(multiple, language, { maximumFractionDigits: 1 })}×`}
                        </span>
                      </div>
                      {domain.rationale && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                          {domain.rationale}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground">
                         {formatLocalizedDateTime(domain.created_at, language)}
                      </p>
                    </div>
                    {domain.registrar_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="shrink-0"
                      >
                        <a
                          href={domain.registrar_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          {isSwedish ? "Köp" : "Buy"}
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <FooterNav />
    </div>
  );
};

export default SearchHistory;

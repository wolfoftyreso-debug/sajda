import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trophy, TrendingUp, Calendar, ExternalLink, RefreshCw, X, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import FooterNav from "@/components/FooterNav";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getRegistrarUrl } from "@/lib/historyService";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedCurrency, formatLocalizedDateTime } from "@/lib/localeFormat";

interface TopDomain {
  id: string;
  domain: string;
  tld: string;
  estimated_value: number;
  confidence_score: number;
  rationale: string | null;
  registrar_price: number;
  scan_date: string;
  rank: number;
}

const Top10Today = () => {
  const [domains, setDomains] = useState<TopDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanDate, setScanDate] = useState<string>("");
  const [deletingDomain, setDeletingDomain] = useState<string | null>(null);
  const { user } = useAuth();
  const { language } = useLanguage();
  const isSwedish = language === "sv";

  const fetchTopDomains = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('daily_top_domains')
        .select('*')
        .eq('scan_date', today)
        .order('rank', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setDomains(data);
        setScanDate(data[0].scan_date);
      } else {
        // Try to get the latest scan if today's isn't available
        const { data: latestData, error: latestError } = await supabase
          .from('daily_top_domains')
          .select('*')
          .order('scan_date', { ascending: false })
          .order('rank', { ascending: true })
          .limit(10);

        if (latestError) throw latestError;
        
        if (latestData && latestData.length > 0) {
          setDomains(latestData);
          setScanDate(latestData[0].scan_date);
        }
      }
    } catch (error) {
      console.error('Error fetching top domains:', error);
      toast.error(isSwedish ? 'Kunde inte hämta dagens top 10' : "Could not load today's top 10");
    } finally {
      setLoading(false);
    }
  }, [isSwedish]);

  useEffect(() => {
    void fetchTopDomains();
  }, [fetchTopDomains]);

  const handleDeleteDomain = async (domainId: string, domainName: string) => {
    if (!user) {
      toast.error(isSwedish ? 'Logga in för att ta bort domäner' : 'Sign in to remove domains');
      return;
    }
    
    setDeletingDomain(domainId);
    try {
      const { error } = await supabase
        .from('daily_top_domains')
        .delete()
        .eq('id', domainId);

      if (error) throw error;

      setDomains(prev => prev.filter(d => d.id !== domainId));
      toast.success(isSwedish ? `${domainName} borttagen från listan` : `${domainName} removed from the list`);
    } catch (error) {
      console.error('Error deleting domain:', error);
      toast.error(isSwedish ? 'Kunde inte ta bort domänen' : 'Could not remove domain');
    } finally {
      setDeletingDomain(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return formatLocalizedDateTime(dateStr, language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'bg-yellow-500 text-yellow-950';
      case 2: return 'bg-gray-300 text-gray-800';
      case 3: return 'bg-amber-600 text-amber-950';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRankIcon = (rank: number) => {
    if (rank <= 3) {
      return <Trophy className="h-5 w-5" />;
    }
    return <span className="font-bold">#{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="h-8 w-8 text-yellow-500" />
            <h1 className="text-3xl font-bold">{isSwedish ? "Top 10 idag" : "Top 10 today"}</h1>
          </div>
          {scanDate && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(scanDate)}</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {isSwedish
              ? "De mest värdefulla tillgängliga domänerna hittade vid nattens skanning"
              : "The highest-value available domains found in the overnight scan"}
          </p>
        </div>

        {/* Refresh button */}
        <div className="flex justify-end mb-4">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTopDomains}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {isSwedish ? "Uppdatera" : "Refresh"}
          </Button>
        </div>

        {/* Domain list */}
        <div className="space-y-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-full" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : domains.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">
                  {isSwedish ? "Ingen data tillgänglig" : "No data available"}
                </h3>
                <p className="text-muted-foreground">
                  {isSwedish
                    ? "Nattens skanning har inte körts ännu. Kom tillbaka efter kl 06:00!"
                    : "The overnight scan has not run yet. Please return after 06:00."}
                </p>
              </CardContent>
            </Card>
          ) : (
            domains.map((domain) => (
              <Card 
                key={domain.id} 
                className={`transition-all hover:shadow-lg ${domain.rank <= 3 ? 'border-2' : ''} ${
                  domain.rank === 1 ? 'border-yellow-500' : 
                  domain.rank === 2 ? 'border-gray-300' : 
                  domain.rank === 3 ? 'border-amber-600' : ''
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Rank badge */}
                    <div className={`flex items-center justify-center h-10 w-10 rounded-full ${getRankColor(domain.rank)}`}>
                      {getRankIcon(domain.rank)}
                    </div>

                    {/* Domain info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-lg truncate">{domain.domain}</h3>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">.{domain.tld}</Badge>
                          {user && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteDomain(domain.id, domain.domain)}
                                    disabled={deletingDomain === domain.id}
                                    aria-label={isSwedish ? `Ta bort ${domain.domain}` : `Remove ${domain.domain}`}
                                  >
                                    {deletingDomain === domain.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{isSwedish ? "Ta bort (ägs av någon)" : "Remove (owned by someone)"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex items-center gap-1 text-green-600">
                          <TrendingUp className="h-4 w-4" />
                          <span className="font-bold">{`≈ ${formatLocalizedCurrency(domain.estimated_value, "USD", language)}`}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {`${isSwedish ? "Prisestimat" : "Price estimate"}: ≈ ${formatLocalizedCurrency(domain.registrar_price, "USD", language)}`}
                        </span>
                        <Badge 
                          variant={domain.confidence_score >= 80 ? "default" : domain.confidence_score >= 60 ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          {isSwedish ? `${domain.confidence_score}% signalsäkerhet` : `${domain.confidence_score}% signal confidence`}
                        </Badge>
                      </div>

                      {domain.rationale && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {domain.rationale}
                        </p>
                      )}

                      <div className="mt-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          asChild
                          className="w-full sm:w-auto"
                        >
                          <a 
                            href={getRegistrarUrl(domain.domain)} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            {isSwedish ? "Öppna hos registrar" : "Open at registrar"}
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Stats summary */}
        {domains.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">{isSwedish ? "Sammanfattning" : "Summary"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-green-600">
                    {formatLocalizedCurrency(domains.reduce((sum, d) => sum + d.estimated_value, 0), "USD", language)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isSwedish ? "Summerat screeningvärde" : "Combined screening value"}
                  </p>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {formatLocalizedCurrency(domains.reduce((sum, d) => sum + d.registrar_price, 0), "USD", language)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isSwedish ? "Summerat prisestimat" : "Combined price estimate"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      
      <FooterNav />
    </div>
  );
};

export default Top10Today;

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit2, Globe, Calendar, Loader2, Check, Server, TrendingUp, AlertTriangle, ArrowUpDown, CheckCircle2, Search, Tag, ExternalLink, XCircle } from "lucide-react";
import { addMonths, differenceInDays, isBefore } from "date-fns";
import { MyDomainsPageSkeleton } from "@/components/PageSkeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import FooterNav from "@/components/FooterNav";
import { useLanguage } from "@/i18n/LanguageProvider";
import { formatLocalizedCurrency, formatLocalizedDateTime } from "@/lib/localeFormat";
import {
  getUserDomains,
  addUserDomain,
  addUserDomainsBulk,
  updateUserDomain,
  deleteUserDomain,
  checkDomainLiveStatus,
  valuateDomains,
  type UserDomain,
} from "@/lib/userDomainsService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortOption = "name" | "value" | "price" | "date" | "in_use" | "category";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | "in_use" | "not_in_use" | "published" | "not_published";

const DOMAIN_CATEGORIES = [
  { value: "finans", label: { en: "Finance & credit", sv: "Finans & kredit" } },
  { value: "ehandel", label: { en: "E-commerce", sv: "E-handel" } },
  { value: "portfolio", label: { en: "Portfolio", sv: "Portfolio" } },
  { value: "saas", label: { en: "SaaS / startup", sv: "SaaS / startup" } },
  { value: "media", label: { en: "Media & news", sv: "Media & nyheter" } },
  { value: "spel", label: { en: "Games & entertainment", sv: "Spel & underhållning" } },
  { value: "utbildning", label: { en: "Education", sv: "Utbildning" } },
  { value: "halsa", label: { en: "Health & wellness", sv: "Hälsa & wellness" } },
  { value: "fastighet", label: { en: "Real estate", sv: "Fastigheter" } },
  { value: "teknik", label: { en: "Technology & IT", sv: "Teknik & IT" } },
  { value: "resa", label: { en: "Travel & tourism", sv: "Resa & turism" } },
  { value: "mat", label: { en: "Food & restaurants", sv: "Mat & restaurang" } },
  { value: "parkering", label: { en: "Parking", sv: "Parkering" } },
  { value: "ovrigt", label: { en: "Other", sv: "Övrigt" } },
] as const;

type DomainCategory = typeof DOMAIN_CATEGORIES[number]["value"] | null;

const MyDomains = () => {
  const [domains, setDomains] = useState<UserDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingDomain, setEditingDomain] = useState<UserDomain | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingLive, setCheckingLive] = useState<string | null>(null);
  const [valuating, setValuating] = useState(false);
  const [valuationProgress, setValuationProgress] = useState(0);
  const [selectedTLD, setSelectedTLD] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [togglingInUse, setTogglingInUse] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<DomainCategory>(null);
  const { language } = useLanguage();
  const isSwedish = language === "sv";
  const categoryLabel = (category: string | null) => {
    const match = DOMAIN_CATEGORIES.find((item) => item.value === category);
    return match?.label[language as keyof typeof match.label] ?? match?.label.en ?? category;
  };

  // Get unique TLDs from domains
  const getTLD = (domain: string) => {
    const parts = domain.split('.');
    return parts[parts.length - 1]?.toLowerCase() || '';
  };
  
  const uniqueTLDs = [...new Set(domains.map(d => getTLD(d.domain)))].sort();
  
  // Filter and sort domains
  const filteredAndSortedDomains = useMemo(() => {
    let result = domains;
    
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(d => 
        d.domain.toLowerCase().includes(query) ||
        d.notes?.toLowerCase().includes(query) ||
        d.hosting?.toLowerCase().includes(query) ||
        d.category?.toLowerCase().includes(query)
      );
    }
    
    // Status filter
    switch (statusFilter) {
      case "in_use":
        result = result.filter(d => d.is_live === true);
        break;
      case "not_in_use":
        result = result.filter(d => d.is_live !== true);
        break;
      case "published":
        result = result.filter(d => d.has_website === true);
        break;
      case "not_published":
        result = result.filter(d => d.has_website !== true);
        break;
    }
    
    // Category filter
    if (categoryFilter) {
      result = result.filter(d => d.category === categoryFilter);
    }
    
    // TLD filter
    if (selectedTLD) {
      result = result.filter(d => getTLD(d.domain) === selectedTLD);
    }
    
    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "name":
          comparison = a.domain.localeCompare(b.domain);
          break;
        case "value":
          comparison = (a.estimated_value || 0) - (b.estimated_value || 0);
          break;
        case "price":
          comparison = (a.purchase_price || 0) - (b.purchase_price || 0);
          break;
        case "date": {
          const dateA = a.purchase_date ? new Date(a.purchase_date).getTime() : 0;
          const dateB = b.purchase_date ? new Date(b.purchase_date).getTime() : 0;
          comparison = dateA - dateB;
          break;
        }
        case "in_use":
          comparison = (a.is_live ? 1 : 0) - (b.is_live ? 1 : 0);
          break;
        case "category":
          comparison = (a.category || "").localeCompare(b.category || "");
          break;
      }
      
      return sortDirection === "asc" ? comparison : -comparison;
    });
    
    return result;
  }, [domains, selectedTLD, sortBy, sortDirection, searchQuery, statusFilter, categoryFilter]);

  // Form state
  const [formDomain, setFormDomain] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formHosting, setFormHosting] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [bulkDomains, setBulkDomains] = useState("");
  const [addMode, setAddMode] = useState<"single" | "bulk">("single");

  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  const loadDomains = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getUserDomains();
      setDomains(data);
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte ladda domäner" : "Could not load domains",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [isSwedish, toast]);

  useEffect(() => {
    if (user) {
      void loadDomains();
    }
  }, [user, loadDomains]);

  const resetForm = () => {
    setFormDomain("");
    setFormPrice("");
    setFormDate("");
    setFormNotes("");
    setFormHosting("");
    setFormCategory("");
    setBulkDomains("");
    setEditingDomain(null);
    setAddMode("single");
  };

  const openEditDialog = (domain: UserDomain) => {
    setEditingDomain(domain);
    setFormDomain(domain.domain);
    setFormPrice(domain.purchase_price?.toString() || "");
    setFormDate(domain.purchase_date || "");
    setFormNotes(domain.notes || "");
    setFormHosting(domain.hosting || "");
    setFormCategory(domain.category || "");
    setShowAddDialog(true);
  };

  const parseBulkDomains = (text: string): string[] => {
    // Split by newlines, commas, spaces, or tabs
    const domains = text
      .split(/[\n,\s\t]+/)
      .map(d => d.trim().toLowerCase())
      .filter(d => d.length > 0 && d.includes('.'));
    
    // Remove duplicates
    return [...new Set(domains)];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (addMode === "bulk" && !editingDomain) {
      const domainList = parseBulkDomains(bulkDomains);
      
      if (domainList.length === 0) {
        toast({
          title: isSwedish ? "Inga domäner hittades" : "No domains found",
          description: isSwedish
            ? "Klistra in domäner separerade med radbrytning, komma eller mellanslag"
            : "Paste domains separated by a new line, comma, or space",
          variant: "destructive",
        });
        return;
      }

      setSaving(true);
      try {
        const count = await addUserDomainsBulk(domainList);
        toast({
          title: isSwedish ? "Domäner tillagda" : "Domains added",
          description: isSwedish ? `${count} domäner har lagts till` : `${count} domains have been added`,
        });
        await loadDomains();
        setShowAddDialog(false);
        resetForm();
      } catch (err) {
        toast({
          title: isSwedish ? "Kunde inte lägga till domäner" : "Could not add domains",
          description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
          variant: "destructive",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!formDomain.trim()) {
      toast({
        title: isSwedish ? "Domännamn krävs" : "Domain name required",
        description: isSwedish ? "Ange ett domännamn" : "Enter a domain name",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingDomain) {
        await updateUserDomain(editingDomain.id, {
          domain: formDomain,
          purchase_price: formPrice ? parseFloat(formPrice) : null,
          purchase_date: formDate || null,
          notes: formNotes || null,
          hosting: formHosting || null,
          category: formCategory || null,
        });
        toast({
          title: isSwedish ? "Domän uppdaterad" : "Domain updated",
          description: isSwedish ? `${formDomain} har uppdaterats` : `${formDomain} has been updated`,
        });
      } else {
        await addUserDomain({
          domain: formDomain,
          purchase_price: formPrice ? parseFloat(formPrice) : undefined,
          purchase_date: formDate || undefined,
          notes: formNotes || undefined,
          hosting: formHosting || undefined,
          category: formCategory || undefined,
        });
        toast({
          title: isSwedish ? "Domän tillagd" : "Domain added",
          description: isSwedish ? `${formDomain} har lagts till` : `${formDomain} has been added`,
        });
      }
      
      await loadDomains();
      setShowAddDialog(false);
      resetForm();
    } catch (err) {
      toast({
        title: editingDomain
          ? isSwedish ? "Kunde inte uppdatera" : "Could not update"
          : isSwedish ? "Kunde inte lägga till" : "Could not add",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (domain: UserDomain) => {
    try {
      await deleteUserDomain(domain.id);
      setDomains((prev) => prev.filter((d) => d.id !== domain.id));
      toast({
        title: isSwedish ? "Domän borttagen" : "Domain removed",
        description: isSwedish ? `${domain.domain} har tagits bort` : `${domain.domain} has been removed`,
      });
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte ta bort" : "Could not remove",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    }
  };

  const handleCheckWebsite = async (domain: UserDomain) => {
    setCheckingLive(domain.id);
    try {
      const hasWebsite = await checkDomainLiveStatus(domain.domain);
      await updateUserDomain(domain.id, { 
        has_website: hasWebsite,
        website_checked_at: new Date().toISOString()
      });
      setDomains(prev => prev.map(d => 
        d.id === domain.id ? { ...d, has_website: hasWebsite, website_checked_at: new Date().toISOString() } : d
      ));
      toast({
        title: hasWebsite
          ? isSwedish ? "Webbplats hittad" : "Website found"
          : isSwedish ? "Ingen webbplats" : "No website found",
        description: hasWebsite
          ? isSwedish ? `${domain.domain} har en publicerad webbplats` : `${domain.domain} has a published website`
          : isSwedish ? `${domain.domain} verkar inte ha någon publicerad webbplats` : `${domain.domain} does not appear to have a published website`,
      });
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte kontrollera" : "Could not check",
        description: isSwedish ? "Ett fel uppstod vid kontroll" : "Something went wrong during the check",
        variant: "destructive",
      });
    } finally {
      setCheckingLive(null);
    }
  };

  const handleToggleInUse = async (domain: UserDomain) => {
    setTogglingInUse(domain.id);
    try {
      const newIsLive = !domain.is_live;
      await updateUserDomain(domain.id, { is_live: newIsLive });
      setDomains(prev => prev.map(d => 
        d.id === domain.id ? { ...d, is_live: newIsLive } : d
      ));
      toast({
        title: newIsLive
          ? isSwedish ? "Markerad som används" : "Marked as in use"
          : isSwedish ? "Markerad som oanvänd" : "Marked as not in use",
        description: isSwedish
          ? `${domain.domain} är nu ${newIsLive ? "markerad som aktiv" : "avmarkerad"}`
          : `${domain.domain} is now ${newIsLive ? "marked as active" : "unmarked"}`,
      });
    } catch (err) {
      toast({
        title: "Kunde inte uppdatera",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setTogglingInUse(null);
    }
  };

  const handleValuateAll = async () => {
    if (domains.length === 0) return;
    
    setValuating(true);
    setValuationProgress(0);
    
    try {
      // Batch domains in groups of 10
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < domains.length; i += BATCH_SIZE) {
        batches.push(domains.slice(i, i + BATCH_SIZE));
      }

      let processedCount = 0;
      
      for (const batch of batches) {
        try {
          const valuations = await valuateDomains(batch, "medium");
          
          // Update each domain with its valuation
          for (const valuation of valuations) {
            const domain = batch.find(d => d.domain === valuation.domain);
            if (domain) {
              await updateUserDomain(domain.id, {
                estimated_value: valuation.estimatedValue,
                confidence_score: valuation.confidenceScore,
                valuation_rationale: valuation.rationale,
                valued_at: new Date().toISOString(),
              });
              
              setDomains(prev => prev.map(d => 
                d.domain === valuation.domain 
                  ? { 
                      ...d, 
                      estimated_value: valuation.estimatedValue,
                      confidence_score: valuation.confidenceScore,
                      valuation_rationale: valuation.rationale,
                      valued_at: new Date().toISOString(),
                    } 
                  : d
              ));
            }
          }
        } catch (err) {
          console.error("Batch valuation failed:", err);
        }
        
        processedCount += batch.length;
        setValuationProgress(Math.round((processedCount / domains.length) * 100));
      }

      toast({
        title: isSwedish ? "Värdering klar" : "Valuation complete",
        description: isSwedish ? `${domains.length} domäner har värderats` : `${domains.length} domains have been valued`,
      });
    } catch (err) {
      toast({
        title: isSwedish ? "Kunde inte värdera" : "Could not value domains",
        description: isSwedish && err instanceof Error ? err.message : isSwedish ? "Ett fel uppstod" : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setValuating(false);
      setValuationProgress(0);
    }
  };

  const totalValue = domains.reduce((sum, d) => sum + (d.estimated_value || 0), 0);
  const totalCost = domains.reduce((sum, d) => sum + (d.purchase_price || 0), 0);
  const valuedCount = domains.filter(d => d.estimated_value).length;

  if (authLoading || loading) {
    return (
      <>
        <MyDomainsPageSkeleton />
        <FooterNav />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Search, Filters and Action Buttons */}
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            {domains.length > 0 && (
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={isSwedish ? "Sök domäner..." : "Search domains..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-secondary border-border"
                />
              </div>
            )}
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-3">
            <Dialog open={showAddDialog} onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) resetForm();
            }}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-primary text-primary-foreground">
                  <Plus className="h-4 w-4" />
                  {isSwedish ? "Lägg till" : "Add"}
                </Button>
              </DialogTrigger>
            </Dialog>
            
            {domains.length > 0 && (
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={handleValuateAll}
                disabled={valuating}
              >
                {valuating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <TrendingUp className="h-4 w-4" />
                )}
                {isSwedish ? "Värdera alla" : "Value all"}
              </Button>
            )}
          </div>
          
          {/* Status Filter Buttons */}
          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("all")}
                className="text-xs"
              >
                {isSwedish ? "Alla" : "All"} ({domains.length})
              </Button>
              <Button
                variant={statusFilter === "in_use" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("in_use")}
                className="text-xs gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                {isSwedish ? "Används" : "In use"} ({domains.filter(d => d.is_live).length})
              </Button>
              <Button
                variant={statusFilter === "not_in_use" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("not_in_use")}
                className="text-xs gap-1"
              >
                <XCircle className="h-3 w-3" />
                {isSwedish ? "Oanvända" : "Not in use"} ({domains.filter(d => !d.is_live).length})
              </Button>
              <Button
                variant={statusFilter === "published" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("published")}
                className="text-xs gap-1"
              >
                <ExternalLink className="h-3 w-3" />
                {isSwedish ? "Publicerad" : "Published"} ({domains.filter(d => d.has_website).length})
              </Button>
              <Button
                variant={statusFilter === "not_published" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("not_published")}
                className="text-xs gap-1"
              >
                <Globe className="h-3 w-3" />
                {isSwedish ? "Ej publicerad" : "Not published"} ({domains.filter(d => !d.has_website).length})
              </Button>
            </div>
          )}
          
          {/* Category Filter Buttons */}
          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-muted-foreground mr-2 self-center">
                {isSwedish ? "Kategori:" : "Category:"}
              </span>
              <Button
                variant={categoryFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setCategoryFilter(null)}
                className="text-xs"
              >
                {isSwedish ? "Alla" : "All"}
              </Button>
              {DOMAIN_CATEGORIES.map(cat => {
                const count = domains.filter(d => d.category === cat.value).length;
                if (count === 0) return null;
                return (
                  <Button
                    key={cat.value}
                    variant={categoryFilter === cat.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCategoryFilter(cat.value)}
                    className="text-xs gap-1"
                  >
                    <Tag className="h-3 w-3" />
                    {cat.label[language]} ({count})
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>
        
        <Dialog open={showAddDialog} onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) resetForm();
        }}>
          <DialogContent className="max-w-lg border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {editingDomain
                  ? isSwedish ? "Redigera domän" : "Edit domain"
                  : isSwedish ? "Lägg till domäner" : "Add domains"}
              </DialogTitle>
            </DialogHeader>

            {!editingDomain && (
              <Tabs value={addMode} onValueChange={(v) => setAddMode(v as "single" | "bulk")} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="single">{isSwedish ? "En domän" : "One domain"}</TabsTrigger>
                  <TabsTrigger value="bulk">{isSwedish ? "Flera domäner" : "Multiple domains"}</TabsTrigger>
                </TabsList>

                    <TabsContent value="single" className="mt-4">
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="domain" className="text-foreground">
                            {isSwedish ? "Domännamn *" : "Domain name *"}
                          </Label>
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="domain"
                              placeholder={isSwedish ? "exempel.se" : "example.com"}
                              value={formDomain}
                              onChange={(e) => setFormDomain(e.target.value)}
                              className="border-border bg-secondary pl-10"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="price" className="text-foreground">
                              {isSwedish ? "Inköpspris (kr)" : "Purchase price (SEK)"}
                            </Label>
                            <Input
                              id="price"
                              type="number"
                              placeholder="0"
                              value={formPrice}
                              onChange={(e) => setFormPrice(e.target.value)}
                              className="border-border bg-secondary"
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="date" className="text-foreground">
                              {isSwedish ? "Inköpsdatum" : "Purchase date"}
                            </Label>
                            <Input
                              id="date"
                              type="date"
                              value={formDate}
                              onChange={(e) => setFormDate(e.target.value)}
                              className="border-border bg-secondary"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="hosting" className="text-foreground">
                            {isSwedish ? "Webbhotell" : "Hosting"}
                          </Label>
                          <div className="relative">
                            <Server className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="hosting"
                              placeholder={isSwedish ? "T.ex. Loopia, One.com, AWS..." : "E.g. Loopia, One.com, AWS..."}
                              value={formHosting}
                              onChange={(e) => setFormHosting(e.target.value)}
                              className="border-border bg-secondary pl-10"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="category" className="text-foreground">
                            {isSwedish ? "Kategori / Användningsområde" : "Category / use case"}
                          </Label>
                          <Select value={formCategory || ""} onValueChange={setFormCategory}>
                            <SelectTrigger className="border-border bg-secondary">
                              <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                              <SelectValue placeholder={isSwedish ? "Välj kategori..." : "Choose a category..."} />
                            </SelectTrigger>
                            <SelectContent>
                              {DOMAIN_CATEGORIES.map(cat => (
                                <SelectItem key={cat.value} value={cat.value}>
                                  {cat.label[language]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="notes" className="text-foreground">
                            {isSwedish ? "Anteckningar" : "Notes"}
                          </Label>
                          <Textarea
                            id="notes"
                            placeholder={isSwedish ? "Valfria anteckningar om domänen..." : "Optional notes about this domain..."}
                            value={formNotes}
                            onChange={(e) => setFormNotes(e.target.value)}
                            className="min-h-[60px] border-border bg-secondary"
                          />
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowAddDialog(false);
                              resetForm();
                            }}
                            className="flex-1"
                          >
                            {isSwedish ? "Avbryt" : "Cancel"}
                          </Button>
                          <Button
                            type="submit"
                            disabled={saving}
                            className="flex-1 gap-2 bg-primary text-primary-foreground"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            {isSwedish ? "Lägg till" : "Add"}
                          </Button>
                        </div>
                      </form>
                    </TabsContent>

                    <TabsContent value="bulk" className="mt-4">
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="bulkDomains" className="text-foreground">
                            {isSwedish ? "Klistra in domäner" : "Paste domains"}
                          </Label>
                          <Textarea
                            id="bulkDomains"
                            placeholder={isSwedish
                              ? "Klistra in domäner här. Kan vara separerade med radbrytning, komma eller mellanslag.\n\nExempel:\ndomain1.se\ndomain2.com, domain3.io\ndomain4.net domain5.org"
                              : "Paste domains here. Separate them with new lines, commas, or spaces.\n\nExample:\ndomain1.com\ndomain2.com, domain3.io\ndomain4.net domain5.org"}
                            value={bulkDomains}
                            onChange={(e) => setBulkDomains(e.target.value)}
                            className="min-h-[200px] border-border bg-secondary font-mono text-sm"
                          />
                          {bulkDomains && (
                            <p className="text-xs text-muted-foreground">
                              {isSwedish
                                ? `${parseBulkDomains(bulkDomains).length} domäner hittade`
                                : `${parseBulkDomains(bulkDomains).length} domains found`}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setShowAddDialog(false);
                              resetForm();
                            }}
                            className="flex-1"
                          >
                            {isSwedish ? "Avbryt" : "Cancel"}
                          </Button>
                          <Button
                            type="submit"
                            disabled={saving || parseBulkDomains(bulkDomains).length === 0}
                            className="flex-1 gap-2 bg-primary text-primary-foreground"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            {isSwedish ? "Lägg till" : "Add"} {parseBulkDomains(bulkDomains).length || ""} {isSwedish ? "domäner" : "domains"}
                          </Button>
                        </div>
                      </form>
                    </TabsContent>
              </Tabs>
            )}

            {editingDomain && (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="domain" className="text-foreground">
                        {isSwedish ? "Domännamn *" : "Domain name *"}
                      </Label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="domain"
                          placeholder={isSwedish ? "exempel.se" : "example.com"}
                          value={formDomain}
                          onChange={(e) => setFormDomain(e.target.value)}
                          className="border-border bg-secondary pl-10"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="price" className="text-foreground">
                          {isSwedish ? "Inköpspris (kr)" : "Purchase price (SEK)"}
                        </Label>
                        <Input
                          id="price"
                          type="number"
                          placeholder="0"
                          value={formPrice}
                          onChange={(e) => setFormPrice(e.target.value)}
                          className="border-border bg-secondary"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="date" className="text-foreground">
                          {isSwedish ? "Inköpsdatum" : "Purchase date"}
                        </Label>
                        <Input
                          id="date"
                          type="date"
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                          className="border-border bg-secondary"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="hosting" className="text-foreground">
                        {isSwedish ? "Webbhotell" : "Hosting"}
                      </Label>
                      <div className="relative">
                        <Server className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="hosting"
                          placeholder={isSwedish ? "T.ex. Loopia, One.com, AWS..." : "E.g. Loopia, One.com, AWS..."}
                          value={formHosting}
                          onChange={(e) => setFormHosting(e.target.value)}
                          className="border-border bg-secondary pl-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="editCategory" className="text-foreground">
                        {isSwedish ? "Kategori / Användningsområde" : "Category / use case"}
                      </Label>
                      <Select value={formCategory || ""} onValueChange={setFormCategory}>
                        <SelectTrigger className="border-border bg-secondary">
                          <Tag className="h-4 w-4 mr-2 text-muted-foreground" />
                          <SelectValue placeholder={isSwedish ? "Välj kategori..." : "Choose a category..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {DOMAIN_CATEGORIES.map(cat => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label[language]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes" className="text-foreground">
                        {isSwedish ? "Anteckningar" : "Notes"}
                      </Label>
                      <Textarea
                        id="notes"
                        placeholder={isSwedish ? "Valfria anteckningar om domänen..." : "Optional notes about this domain..."}
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        className="min-h-[60px] border-border bg-secondary"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowAddDialog(false);
                          resetForm();
                        }}
                        className="flex-1"
                      >
                        {isSwedish ? "Avbryt" : "Cancel"}
                      </Button>
                      <Button
                        type="submit"
                        disabled={saving}
                        className="flex-1 gap-2 bg-primary text-primary-foreground"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        {isSwedish ? "Spara" : "Save"}
                      </Button>
                    </div>
                  </form>
            )}
          </DialogContent>
        </Dialog>

      {/* Valuation progress */}
      {valuating && (
        <div className="border-b border-border bg-card/50 px-6 py-3">
          <div className="container mx-auto">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                {isSwedish ? "Värderar domäner..." : "Valuing domains..."}
              </span>
              <div className="flex-1">
                <Progress value={valuationProgress} className="h-2" />
              </div>
              <span className="text-sm font-medium text-foreground">{valuationProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio summary */}
      {domains.length > 0 && valuedCount > 0 && (
        <div className="border-b border-border bg-card/50 px-6 py-4">
          <div className="container mx-auto">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">
                  {isSwedish ? "Summerat screeningvärde" : "Combined screening value"}
                </p>
                <p className="text-lg font-bold text-success">{`≈ ${formatLocalizedCurrency(totalValue, "USD", language)}`}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isSwedish ? "Investerat" : "Invested"}</p>
                <p className="text-lg font-bold text-foreground">{formatLocalizedCurrency(totalCost, "SEK", language)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isSwedish ? "Värderade" : "Valued"}</p>
                <p className="text-lg font-bold text-foreground">{valuedCount}/{domains.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TLD Filter & Sorting */}
      {domains.length > 0 && (
        <div className="border-b border-border bg-card/50 px-6 py-3">
          <div className="container mx-auto">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* TLD Filter */}
              {uniqueTLDs.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground mr-2">
                    {isSwedish ? "Filtrera:" : "Filter:"}
                  </span>
                  <Button
                    variant={selectedTLD === null ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedTLD(null)}
                    className="h-7 px-3 text-xs"
                  >
                    {isSwedish ? "Alla" : "All"} ({domains.length})
                  </Button>
                  {uniqueTLDs.map(tld => {
                    const count = domains.filter(d => getTLD(d.domain) === tld).length;
                    return (
                      <Button
                        key={tld}
                        variant={selectedTLD === tld ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedTLD(tld)}
                        className="h-7 px-3 text-xs"
                      >
                        .{tld} ({count})
                      </Button>
                    );
                  })}
                </div>
              )}
              
              {/* Sorting */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">{isSwedish ? "Namn" : "Name"}</SelectItem>
                    <SelectItem value="value">{isSwedish ? "Värde" : "Value"}</SelectItem>
                    <SelectItem value="price">{isSwedish ? "Inköpspris" : "Purchase price"}</SelectItem>
                    <SelectItem value="date">{isSwedish ? "Datum" : "Date"}</SelectItem>
                    <SelectItem value="in_use">{isSwedish ? "Används" : "In use"}</SelectItem>
                    <SelectItem value="category">{isSwedish ? "Kategori" : "Category"}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(d => d === "asc" ? "desc" : "asc")}
                  className="h-8 px-2"
                >
                  {sortDirection === "asc" ? "↑" : "↓"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="container mx-auto px-6 py-6">
        {domains.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Globe className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-foreground">
              {isSwedish ? "Inga domäner ännu" : "No domains yet"}
            </h2>
            <p className="mb-6 max-w-sm text-muted-foreground">
              {isSwedish
                ? "Lägg till domäner du äger för att hålla koll på din portfölj"
                : "Add domains you own to keep track of your portfolio"}
            </p>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="gap-2 bg-primary text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              {isSwedish ? "Lägg till din första domän" : "Add your first domain"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAndSortedDomains.map((domain) => {
              // Calculate renewal warning (9 months from purchase = 3 months before renewal)
              const renewalWarning = (() => {
                if (!domain.purchase_date) return null;
                const purchaseDate = new Date(domain.purchase_date);
                const warningDate = addMonths(purchaseDate, 9);
                const renewalDate = addMonths(purchaseDate, 12);
                const today = new Date();
                
                if (isBefore(today, warningDate)) return null;
                
                const daysUntilRenewal = differenceInDays(renewalDate, today);
                if (daysUntilRenewal < 0) return { expired: true, days: Math.abs(daysUntilRenewal) };
                return { expired: false, days: daysUntilRenewal };
              })();

              return (
              <div
                key={domain.id}
                className={`rounded-lg border p-4 transition-colors hover:border-primary/50 ${
                  renewalWarning?.expired 
                    ? "border-destructive bg-destructive/10" 
                    : renewalWarning 
                      ? "border-warning bg-warning/10" 
                      : "border-border bg-card"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold text-foreground">
                        {domain.domain}
                      </h3>
                      {/* Renewal warning indicator */}
                      {renewalWarning && (
                        <div 
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            renewalWarning.expired 
                              ? "bg-destructive text-destructive-foreground" 
                              : "bg-warning text-warning-foreground"
                          }`}
                          title={renewalWarning.expired
                            ? isSwedish ? `Utgått för ${renewalWarning.days} dagar sedan` : `Expired ${renewalWarning.days} days ago`
                            : isSwedish ? `Förnyelse om ${renewalWarning.days} dagar` : `Renewal in ${renewalWarning.days} days`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {renewalWarning.expired
                            ? isSwedish ? "Utgått" : "Expired"
                            : isSwedish ? `${renewalWarning.days}d kvar` : `${renewalWarning.days}d left`}
                        </div>
                      )}
                      {/* Website status badge */}
                      {domain.has_website !== null && (
                        <span 
                          className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                            domain.has_website 
                              ? "bg-blue-500/20 text-blue-400" 
                              : "bg-muted text-muted-foreground"
                          }`}
                          title={domain.website_checked_at
                            ? `${isSwedish ? "Kontrollerad" : "Checked"} ${formatLocalizedDateTime(domain.website_checked_at, language, { dateStyle: "medium" })}`
                            : undefined}
                        >
                          {domain.has_website ? (
                            <>
                              <ExternalLink className="h-3 w-3" />
                              {isSwedish ? "Publicerad" : "Published"}
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" />
                              {isSwedish ? "Ej publicerad" : "Not published"}
                            </>
                          )}
                        </span>
                      )}
                      {/* In-use badge */}
                      {domain.is_live && (
                        <span className="flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-success">
                          <CheckCircle2 className="h-3 w-3" />
                          {isSwedish ? "Används" : "In use"}
                        </span>
                      )}
                      {checkingLive === domain.id && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {domain.purchase_price && (
                        <span className="flex items-center gap-1">
                          {isSwedish ? "Köpt" : "Purchased"}: {formatLocalizedCurrency(domain.purchase_price, "SEK", language)}
                        </span>
                      )}
                      {domain.estimated_value && (
                        <span className="flex items-center gap-1 text-success">
                          <TrendingUp className="h-3.5 w-3.5" />
                          {`${isSwedish ? "Screeningvärde" : "Screening value"}: ≈ ${formatLocalizedCurrency(domain.estimated_value, "USD", language)}`}
                        </span>
                      )}
                      {domain.confidence_score && (
                        <span className="flex items-center gap-1">
                          {isSwedish ? "Konfidens" : "Confidence"}: {domain.confidence_score}%
                        </span>
                      )}
                      {domain.purchase_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatLocalizedDateTime(domain.purchase_date, language, { dateStyle: "medium" })}
                        </span>
                      )}
                      {domain.hosting && (
                        <span className="flex items-center gap-1">
                          <Server className="h-3.5 w-3.5" />
                          {domain.hosting}
                        </span>
                      )}
                      {domain.category && (
                        <span className="flex items-center gap-1 text-primary">
                          <Tag className="h-3.5 w-3.5" />
                          {categoryLabel(domain.category)}
                        </span>
                      )}
                    </div>
                    
                    {domain.valuation_rationale && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {domain.valuation_rationale}
                      </p>
                    )}
                    
                    {domain.notes && !domain.valuation_rationale && (
                      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                        {domain.notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      variant={domain.is_live ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggleInUse(domain)}
                      disabled={togglingInUse === domain.id}
                      className={`h-7 gap-1.5 text-xs ${domain.is_live ? "bg-success hover:bg-success/90" : ""}`}
                      title={domain.is_live
                        ? isSwedish ? "Markerad som används" : "Marked as in use"
                        : isSwedish ? "Markera som används" : "Mark as in use"}
                    >
                      {togglingInUse === domain.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {domain.is_live ? isSwedish ? "Används" : "In use" : isSwedish ? "Använd" : "Use"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCheckWebsite(domain)}
                      disabled={checkingLive === domain.id}
                      className="h-7 gap-1.5 text-xs"
                      title={isSwedish ? "Kontrollera om det finns en publicerad webbplats" : "Check whether a published website exists"}
                    >
                      {checkingLive === domain.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Globe className="h-3 w-3" />
                      )}
                      {isSwedish ? "Kolla webb" : "Check website"}
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(domain)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        aria-label={isSwedish ? `Redigera ${domain.domain}` : `Edit ${domain.domain}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(domain)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        aria-label={isSwedish ? `Ta bort ${domain.domain}` : `Remove ${domain.domain}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
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

export default MyDomains;

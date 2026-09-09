import { supabase } from "@/integrations/supabase/client";
import { getStoredLanguage, translate } from "@/i18n/LanguageProvider";

export interface DomainHistoryItem {
  id: string;
  domain: string;
  tld: string;
  registrar_price: number;
  estimated_value: number;
  confidence_score: number;
  rationale: string | null;
  registrar_url: string | null;
  created_at: string;
}

export async function saveDomainToHistory(domain: {
  domain: string;
  tld: string;
  registrarPrice: number;
  estimatedValue: number;
  confidenceScore: number;
  rationale: string;
  registrarUrl: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    // Don't save if not logged in
    return;
  }

  const { error } = await supabase.from("user_domain_history").upsert({
    domain: domain.domain,
    tld: domain.tld,
    registrar_price: domain.registrarPrice,
    estimated_value: domain.estimatedValue,
    confidence_score: domain.confidenceScore,
    rationale: domain.rationale,
    registrar_url: domain.registrarUrl,
    user_id: user.id,
  }, { onConflict: "user_id,domain" });

  if (error) {
    console.error("Failed to save domain to history:", error);
  }
}

export async function clearDomainHistory(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error(translate(getStoredLanguage(), "service.signInRequired"));
  }

  const { error } = await supabase
    .from("user_domain_history")
    .delete()
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function getDomainHistory(): Promise<DomainHistoryItem[]> {
  const { data, error } = await supabase
    .from("user_domain_history")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Failed to fetch domain history:", error);
    return [];
  }

  return data || [];
}

export function getRegistrarUrl(domain: string): string {
  const tld = domain.split(".").pop()?.toLowerCase() || "com";
  
  const registrars: Record<string, string> = {
    com: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    net: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    org: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    io: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    dev: `https://domains.google.com/registrar/search?searchTerm=${domain}`,
    app: `https://domains.google.com/registrar/search?searchTerm=${domain}`,
    ai: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    co: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    me: `https://www.namecheap.com/domains/registration/results/?domain=${domain}`,
    // Loopia's former /sok/ and query-string deep links now return 404 or
    // ignore the requested name. Use its canonical domain search page until a
    // supported deep-link/API contract is available.
    se: "https://www.loopia.se/domannamn/",
    nu: "https://www.loopia.se/domannamn/",
  };

  return registrars[tld] || `https://www.namecheap.com/domains/registration/results/?domain=${domain}`;
}

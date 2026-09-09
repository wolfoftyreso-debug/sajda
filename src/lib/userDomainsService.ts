import { supabase } from "@/integrations/supabase/client";
import { getStoredLanguage, translate } from "@/i18n/LanguageProvider";

export interface UserDomain {
  id: string;
  user_id: string;
  domain: string;
  purchase_price: number | null;
  purchase_date: string | null;
  notes: string | null;
  hosting: string | null;
  category: string | null;
  is_live: boolean;
  has_website: boolean | null;
  website_checked_at: string | null;
  estimated_value: number | null;
  confidence_score: number | null;
  valuation_rationale: string | null;
  valued_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserDomains(): Promise<UserDomain[]> {
  const { data, error } = await supabase
    .from("user_domains")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch user domains:", error);
    throw new Error(error.message);
  }

  return data || [];
}

export async function addUserDomain(domain: {
  domain: string;
  purchase_price?: number;
  purchase_date?: string;
  notes?: string;
  hosting?: string;
  category?: string;
}): Promise<UserDomain> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error(translate(getStoredLanguage(), "service.addDomains"));
  }

  const { data, error } = await supabase
    .from("user_domains")
    .insert({
      user_id: user.id,
      domain: domain.domain.toLowerCase().trim(),
      purchase_price: domain.purchase_price || null,
      purchase_date: domain.purchase_date || null,
      notes: domain.notes || null,
      hosting: domain.hosting || null,
      category: domain.category || null,
      is_live: false,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error(translate(getStoredLanguage(), "service.domainExists"));
    }
    console.error("Failed to add domain:", error);
    throw new Error(error.message);
  }

  // Value through the authenticated user endpoint. The job-only bulk endpoint
  // deliberately rejects browser requests and must not be used here.
  valuateAndPersistDomains([data]).catch(err => {
    console.error("Background valuation failed:", err);
  });

  return data;
}

export async function addUserDomainsBulk(domains: string[]): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error(translate(getStoredLanguage(), "service.addDomains"));
  }

  const domainRecords = domains.map(domain => ({
    user_id: user.id,
    domain: domain.toLowerCase().trim(),
    is_live: false,
  }));

  const { data, error } = await supabase
    .from("user_domains")
    .upsert(domainRecords, { onConflict: "user_id,domain", ignoreDuplicates: true })
    .select();

  if (error) {
    console.error("Failed to add domains:", error);
    throw new Error(error.message);
  }

  // Value through the authenticated user endpoint. The job-only bulk endpoint
  // deliberately rejects browser requests and must not be used here.
  if (data && data.length > 0) {
    valuateAndPersistDomains(data as UserDomain[]).catch(err => {
      console.error("Background valuation failed:", err);
    });
  }

  return data?.length || 0;
}

export async function updateUserDomain(
  id: string,
  updates: {
    domain?: string;
    purchase_price?: number | null;
    purchase_date?: string | null;
    notes?: string | null;
    hosting?: string | null;
    category?: string | null;
    is_live?: boolean;
    has_website?: boolean | null;
    website_checked_at?: string | null;
    estimated_value?: number | null;
    confidence_score?: number | null;
    valuation_rationale?: string | null;
    valued_at?: string | null;
  }
): Promise<UserDomain> {
  const { data, error } = await supabase
    .from("user_domains")
    .update({
      ...updates,
      domain: updates.domain?.toLowerCase().trim(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Failed to update domain:", error);
    throw new Error(error.message);
  }

  return data;
}

export async function deleteUserDomain(id: string): Promise<void> {
  const { error } = await supabase
    .from("user_domains")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Failed to delete domain:", error);
    throw new Error(error.message);
  }
}

export async function checkDomainLiveStatus(domain: string): Promise<boolean> {
  try {
    await fetch(`https://${domain}`, { 
      method: 'HEAD',
      mode: 'no-cors',
      signal: AbortSignal.timeout(5000)
    });
    return true;
  } catch {
    try {
      await fetch(`http://${domain}`, { 
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(5000)
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Get TLD from domain
function getTLD(domain: string): string {
  const parts = domain.split('.');
  return parts[parts.length - 1] || 'com';
}

// Valuate domains using the existing edge function
export async function valuateDomains(
  domains: UserDomain[],
  mode: "light" | "medium" | "heavy" | "deep" = "medium"
): Promise<Array<{
  domain: string;
  estimatedValue: number;
  confidenceScore: number;
  rationale: string;
}>> {
  const domainsToValue = domains.map(d => ({
    domain: d.domain,
    registrarPrice: d.purchase_price || 100,
    tld: getTLD(d.domain),
  }));

  const { data, error } = await supabase.functions.invoke('value-domains', {
    body: { domains: domainsToValue, mode }
  });

  if (error) {
    console.error("Failed to valuate domains:", error);
    throw new Error(error.message || translate(getStoredLanguage(), "service.valueDomains"));
  }

  return data.valuations || [];
}

async function valuateAndPersistDomains(domains: UserDomain[]): Promise<void> {
  const valuations = await valuateDomains(domains);
  const domainsByName = new Map(domains.map((domain) => [domain.domain.toLowerCase(), domain]));

  await Promise.all(valuations.map(async (valuation) => {
    const domain = domainsByName.get(valuation.domain.toLowerCase());
    if (!domain) return;

    await updateUserDomain(domain.id, {
      estimated_value: valuation.estimatedValue,
      confidence_score: valuation.confidenceScore,
      valuation_rationale: valuation.rationale,
      valued_at: new Date().toISOString(),
    });
  }));
}

import { useState } from "react";
import type { ProviderCatalogEntry } from "@/lib/providerCatalog";
import { cn } from "@/lib/utils";

type ProviderLogoSize = "sm" | "md";

interface ProviderLogoProps {
  provider: ProviderCatalogEntry;
  size?: ProviderLogoSize;
  className?: string;
}

const sizeClasses: Record<ProviderLogoSize, string> = {
  sm: "h-8 text-[10px]",
  md: "h-10 text-xs",
};

/**
 * Renders each seller's published brand mark in a consistent, compact frame.
 * The local monogram remains only as a graceful fallback if that asset fails.
 */
const ProviderLogo = ({ provider, size = "md", className }: ProviderLogoProps) => {
  const [hasImageError, setHasImageError] = useState(false);
  const displayFallback = hasImageError || !provider.logoUrl;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/[0.08] shadow-sm",
        sizeClasses[size],
        provider.logoWide ? "w-[4.75rem] px-2" : size === "sm" ? "w-8" : "w-10",
        provider.logoSurface === "dark" ? "bg-[#1b2534]" : "bg-white",
        className,
      )}
    >
      {displayFallback ? (
        <span
          className="inline-flex h-full w-full items-center justify-center px-1 font-semibold tracking-[-0.05em] text-white"
          style={{ backgroundColor: provider.logoFallbackColor }}
        >
          {provider.logoMonogram}
        </span>
      ) : (
        <img
          src={provider.logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
          className="h-full w-full object-contain p-1"
        />
      )}
    </span>
  );
};

export default ProviderLogo;

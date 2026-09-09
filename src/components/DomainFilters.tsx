import { ArrowUpDown, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useLanguage, type TranslationKey } from "@/i18n/LanguageProvider";

export type SortOption = "recommended" | "confidence-desc" | "confidence-asc" | "price-asc" | "price-desc" | "value-desc" | "value-asc";

export interface FilterOptions {
  minConfidence: number;
  maxPrice: number;
}

interface DomainFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  activeFilterCount: number;
  supportsPricing?: boolean;
  supportsValuation?: boolean;
}

const sortLabelKeys: Record<SortOption, TranslationKey> = {
  "recommended": "filters.recommended",
  "confidence-desc": "filters.confidenceHigh",
  "confidence-asc": "filters.confidenceLow",
  "price-asc": "filters.priceLow",
  "price-desc": "filters.priceHigh",
  "value-desc": "filters.valueHigh",
  "value-asc": "filters.valueLow",
};

const DomainFilters = ({
  sortBy,
  onSortChange,
  filters,
  onFiltersChange,
  activeFilterCount,
  supportsPricing = true,
  supportsValuation = false,
}: DomainFiltersProps) => {
  const { t } = useLanguage();
  const sortLabel = (option: SortOption) => t(sortLabelKeys[option]);
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {/* Sort Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 border-border bg-card hover:bg-secondary">
            <ArrowUpDown className="h-4 w-4" />
            <span className="hidden sm:inline">{t("filters.sort")}</span>
            <span className="max-w-[140px] truncate text-primary">
              {sortLabel(sortBy).split(" (")[0]}
            </span>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 border-border bg-card">
          <DropdownMenuLabel className="text-muted-foreground">{t("filters.sortBy")}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={() => onSortChange("recommended")}
            className={sortBy === "recommended" ? "bg-primary/10 text-primary" : ""}
          >
            {sortLabel("recommended")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortChange("confidence-desc")}
            className={sortBy === "confidence-desc" ? "bg-primary/10 text-primary" : ""}
          >
            {sortLabel("confidence-desc")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortChange("confidence-asc")}
            className={sortBy === "confidence-asc" ? "bg-primary/10 text-primary" : ""}
          >
            {sortLabel("confidence-asc")}
          </DropdownMenuItem>
          {supportsPricing && (
            <>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                onClick={() => onSortChange("price-asc")}
                className={sortBy === "price-asc" ? "bg-primary/10 text-primary" : ""}
              >
                {sortLabel("price-asc")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSortChange("price-desc")}
                className={sortBy === "price-desc" ? "bg-primary/10 text-primary" : ""}
              >
                {sortLabel("price-desc")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
            </>
          )}
          {supportsValuation && <><DropdownMenuItem
            onClick={() => onSortChange("value-desc")}
            className={sortBy === "value-desc" ? "bg-primary/10 text-primary" : ""}
          >
            {sortLabel("value-desc")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onSortChange("value-asc")}
            className={sortBy === "value-asc" ? "bg-primary/10 text-primary" : ""}
          >
            {sortLabel("value-asc")}
          </DropdownMenuItem></>}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Filters Popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="gap-2 border-border bg-card hover:bg-secondary">
            <Filter className="h-4 w-4" />
            {t("filters.filter")}
            {activeFilterCount > 0 && (
              <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] border-border bg-card p-4">
          <div className="space-y-6">
            <div>
              <h4 className="mb-3 text-sm font-medium text-foreground">{t("filters.title")}</h4>
            </div>

            {/* Min Confidence */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label id="minimum-domain-quality" className="text-sm text-muted-foreground">{t("filters.minConfidence")}</label>
                <span className="text-sm font-medium text-primary">{filters.minConfidence}/100</span>
              </div>
              <Slider
                aria-labelledby="minimum-domain-quality"
                value={[filters.minConfidence]}
                onValueChange={([value]) =>
                  onFiltersChange({ ...filters, minConfidence: value })
                }
                max={100}
                min={0}
                step={5}
                className="w-full"
              />
            </div>

            {supportsPricing && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label id="maximum-domain-price" className="text-sm text-muted-foreground">{t("filters.maxPrice")}</label>
                    <span className="text-sm font-medium text-primary">
                      {filters.maxPrice >= 5000 ? t("filters.all") : `$${filters.maxPrice}`}
                    </span>
                  </div>
                  <Slider
                    aria-labelledby="maximum-domain-price"
                    value={[filters.maxPrice]}
                    onValueChange={([value]) =>
                      onFiltersChange({ ...filters, maxPrice: value })
                    }
                    max={5000}
                    min={10}
                    step={10}
                    className="w-full"
                  />
                </div>
              </>
            )}

            {/* Reset Button */}
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
              onClick={() =>
                onFiltersChange({ minConfidence: 0, maxPrice: 5000 })
              }
            >
              {t("filters.reset")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DomainFilters;

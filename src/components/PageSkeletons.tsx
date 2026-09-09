import { Skeleton } from "@/components/ui/skeleton";

// Skeleton for domain cards on Index page
export const DomainCardSkeleton = () => (
  <div className="rounded-lg border border-border bg-card p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <div className="flex gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  </div>
);

// Skeleton for MyDomains page
export const MyDomainsPageSkeleton = () => (
  <div className="min-h-screen bg-background pb-24">
    {/* Action Buttons */}
    <div className="flex justify-center gap-3 py-4">
      <Skeleton className="h-10 w-28" />
      <Skeleton className="h-10 w-32" />
    </div>

    {/* Stats Row */}
    <div className="container mx-auto px-4">
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-7 w-32" />
          </div>
        ))}
      </div>

      {/* TLD Filter */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>

      {/* Domain List */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded" />
                <Skeleton className="h-8 w-8 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// Skeleton for Watchlist page
export const WatchlistPageSkeleton = () => (
  <div className="min-h-screen bg-background">
    {/* Header */}
    <header className="border-b border-border bg-card/50">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-1">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
        <div className="hidden space-y-1 text-right sm:block">
          <Skeleton className="ml-auto h-4 w-24" />
          <Skeleton className="ml-auto h-6 w-32" />
          <Skeleton className="ml-auto h-3 w-28" />
        </div>
      </div>
    </header>

    {/* Content */}
    <main className="container mx-auto px-6 py-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <DomainCardSkeleton key={i} />
        ))}
      </div>
    </main>
  </div>
);

// Skeleton for SearchHistory page
export const SearchHistoryPageSkeleton = () => (
  <div className="min-h-screen bg-background pb-24">
    {/* Header */}
    <header className="border-b border-border bg-card/50">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="h-9 w-20" />
      </div>
    </header>

    {/* Content */}
    <main className="container mx-auto px-6 py-6">
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-10 rounded" />
                </div>
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        ))}
      </div>
    </main>
  </div>
);

// Skeleton for Account page
export const AccountPageSkeleton = () => (
  <div className="min-h-screen bg-background pb-24">
    <main className="container mx-auto px-6 py-6">
      <div className="space-y-6">
        {/* Profile Card */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="rounded-lg border border-border bg-card p-6">
          <Skeleton className="mb-4 h-5 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </div>

        {/* Sign Out Button */}
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  </div>
);

/**
 * /jobs (or /) — the discover page.
 *
 * Two layouts:
 *   - Mobile (< md): swipe interface, one card at a time
 *   - Desktop (>= md): two-column list of scored job rows + sticky filter sidebar.
 *     Each row clicks through to /jobs/:id.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { getQueryFn, apiRequest } from "@/lib/api";
import { SwipeInterface } from "@/components/SwipeInterface";
import { TopNavigation } from "@/components/TopNavigation";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Briefcase, Globe, MapPin, Building, Heart, Bookmark, X, ExternalLink, Search, SlidersHorizontal } from "lucide-react";

type SortMode = "relevance" | "recent";
type RemoteMode = "any" | "remote" | "hybrid" | "onsite";

interface FilterState {
  q: string;
  sort: SortMode;
  location: string;
  remote: RemoteMode;
  visaOnly: boolean;
  salaryMin: number | null;
  country: "us" | "any";
}

const DEFAULT_FILTERS: FilterState = {
  q: "",
  sort: "relevance",
  location: "",
  remote: "any",
  visaOnly: false,
  salaryMin: null,
  country: "us",
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function activeChips(f: FilterState): string[] {
  const chips: string[] = [];
  if (f.country === "us") chips.push("United States");
  else chips.push("Anywhere");
  if (f.location) chips.push(`In: ${f.location}`);
  if (f.remote !== "any") chips.push(f.remote === "remote" ? "Remote" : f.remote === "hybrid" ? "Hybrid" : "On-site");
  if (f.visaOnly) chips.push("Visa sponsors");
  if (f.salaryMin) chips.push(`≥ $${(f.salaryMin / 1000).toFixed(0)}K`);
  return chips;
}

function labelColor(label: string): string {
  if (label === "Strong fit") return "bg-green-100 text-green-800";
  if (label === "Promising fit") return "bg-blue-100 text-blue-800";
  if (label === "Stretch") return "bg-yellow-100 text-yellow-800";
  if (label === "Insufficient data") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

function bandColor(value: number): string {
  if (value >= 0.75) return "bg-green-500";
  if (value >= 0.5) return "bg-blue-500";
  if (value >= 0.3) return "bg-yellow-500";
  return "bg-red-400";
}

function summarizePref(rp: string | null | undefined): string {
  if (!rp) return "any work mode";
  return rp.split(/[,|]+/).map(s => s.trim()).filter(Boolean).map(m =>
    m === "remote" ? "Remote" : m === "hybrid" ? "Hybrid" : m === "onsite" ? "On-site" : m
  ).join(" / ");
}

function summarizeLocations(loc: string | null | undefined): string {
  if (!loc) return "Anywhere";
  return loc.split(/[|;\n]+/).map(s => s.trim()).filter(Boolean).join(" · ");
}

export default function Jobs() {
  const qc = useQueryClient();

  const { data: meData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const user = meData?.user;

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const debounced = useDebounced(filters, 350);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (debounced.q.trim()) sp.set("q", debounced.q.trim());
    sp.set("sort", debounced.sort);
    sp.set("country", debounced.country);
    if (debounced.location.trim()) sp.set("location", debounced.location.trim());
    if (debounced.remote !== "any") sp.set("remote", debounced.remote);
    if (debounced.visaOnly) sp.set("visa", "true");
    if (debounced.salaryMin) sp.set("salaryMin", String(debounced.salaryMin));
    return sp.toString();
  }, [debounced]);

  const feedKey = `/api/jobs/feed?${queryString}`;
  const { data: feedData, isLoading, isFetching } = useQuery<{ jobs: any[]; count: number }>({
    queryKey: [feedKey],
    queryFn: getQueryFn({ on401: "throw" }),
    // Keep the previous result visible while a new filter is fetching — much
    // less jarring than wiping the list to the loading state on every keystroke.
    placeholderData: (prev) => prev,
    // Always refetch on mount + filter-change. The global queryClient default
    // is staleTime: Infinity, which had been making the feed stick to stale
    // "0 count" responses from before backfills landed. With placeholderData
    // above, the user still sees the old list during the refetch — no flash.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const jobs = feedData?.jobs ?? [];
  const chips = activeChips(filters);
  const isFiltered = chips.length > 1 || filters.q.length > 0 || filters.sort !== "relevance";

  const interactMutation = useMutation({
    mutationFn: async ({ jobId, action, matchScore, visaScore }: any) => {
      const r = await apiRequest("POST", `/api/jobs/${jobId}/interact`, {
        action,
        matchScore: matchScore?.toString(),
        visaScore: visaScore?.toString(),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [feedKey] });
      qc.invalidateQueries({ queryKey: ["/api/jobs/liked"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
  });

  const handleSwipe = (job: any, dir: "left" | "right") => {
    interactMutation.mutate({
      jobId: job.id,
      action: dir === "right" ? "swipe_right" : "swipe_left",
      matchScore: job.matchScore,
      visaScore: job.visaScore,
    });
  };
  const handleBookmark = (job: any) => {
    interactMutation.mutate({ jobId: job.id, action: "bookmark", matchScore: job.matchScore });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <TopNavigation user={user} />

      {/* === MOBILE: swipe interface === */}
      <div className="md:hidden">
        <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-30">
          {user && (
            <div className="max-w-md mx-auto flex items-center justify-between text-sm">
              <span className="text-gray-600 truncate">
                Looking for: <span className="font-medium text-gray-900">{user.targetJobTitle ?? "Any role"}</span>
              </span>
              {user.visaStatus && !["us_citizen", "green_card", "asylum_ead", "citizen"].includes(user.visaStatus) && (
                <span className="inline-flex items-center gap-1 bg-secondary/10 px-2 py-0.5 rounded-full text-secondary text-xs font-medium ml-2 shrink-0">
                  <Globe className="w-3 h-3" />
                  {user.visaStatus.replace(/_/g, "-").toUpperCase()}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="max-w-md mx-auto pb-4">
          {isLoading && <div className="text-center py-12 text-gray-500">Loading jobs…</div>}
          {!isLoading && jobs.length > 0 ? (
            <SwipeInterface jobs={jobs} onSwipe={handleSwipe} onBookmark={handleBookmark} user={user} />
          ) : !isLoading && (
            <Card className="mx-4 mt-6">
              <CardContent className="p-8 text-center text-gray-500">
                <Briefcase className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No more jobs right now.</p>
                <p className="text-sm mt-1">Check back later.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* === DESKTOP: list view === */}
      <div className="hidden md:block max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar — user profile summary */}
          <aside className="col-span-3 space-y-4 sticky top-20 self-start">
            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Looking for</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Role</div>
                    <div className="font-medium text-gray-900">{user?.targetJobTitle ?? "Any role"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Locations</div>
                    <div className="font-medium text-gray-900 text-sm">{summarizeLocations(user?.preferredLocation)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Mode</div>
                    <div className="font-medium text-gray-900">{summarizePref(user?.remotePreference)}</div>
                  </div>
                  {user?.visaStatus && !["us_citizen", "green_card", "asylum_ead", "citizen"].includes(user.visaStatus) && (
                    <div>
                      <div className="text-xs text-gray-500">Visa</div>
                      <div className="font-medium text-gray-900 inline-flex items-center gap-1">
                        <Globe className="w-3.5 h-3.5 text-purple-600" />
                        {user.visaStatus.replace(/_/g, "-").toUpperCase()}
                      </div>
                    </div>
                  )}
                </div>
                <Link href="/profile">
                  <a className="block text-xs text-primary hover:underline mt-3">Edit preferences →</a>
                </Link>
              </CardContent>
            </Card>
          </aside>

          {/* Job list */}
          <main className="col-span-9">
            <header className="mb-4 flex items-baseline justify-between">
              <h1 className="text-2xl font-bold text-gray-900">Discover jobs</h1>
              <span className="text-sm text-gray-500 flex items-center gap-2">
                {isFetching && !isLoading && (
                  <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-label="Updating" />
                )}
                {isLoading ? "" : `${jobs.length} scored`}
              </span>
            </header>

            <SearchFilterBar filters={filters} onChange={setFilters} chips={chips} />
            {isFiltered && (
              <div className="mb-4 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Filtered by:</span>
                {chips.map(c => (
                  <Badge key={c} variant="secondary" className="font-normal">{c}</Badge>
                ))}
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="text-primary hover:underline ml-1"
                >
                  Clear all
                </button>
              </div>
            )}

            {isLoading && <div className="text-gray-500 py-8">Loading scored jobs…</div>}

            {!isLoading && jobs.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <Briefcase className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No more jobs to score right now.</p>
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {jobs.map(job => (
                <Card key={job.id} className="hover:border-primary hover:shadow-sm transition-all">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {job.label && (
                            <Badge className={`${labelColor(job.label)} border-0 text-xs`}>
                              {job.label}
                            </Badge>
                          )}
                          {job.isRemote && <Badge variant="outline" className="text-green-700 bg-green-50 text-xs">Remote</Badge>}
                          {job.isHybrid && <Badge variant="outline" className="text-blue-700 bg-blue-50 text-xs">Hybrid</Badge>}
                          {job.sponsorsVisa && <Badge variant="outline" className="text-purple-700 bg-purple-50 text-xs">Visa sponsor</Badge>}
                        </div>
                        <Link href={`/jobs/${job.id}`}>
                          <h3 className="font-semibold text-gray-900 text-lg leading-snug hover:text-primary cursor-pointer">{job.title}</h3>
                        </Link>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <Building className="w-3.5 h-3.5" /> {job.company}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" /> {job.location}
                          </span>
                        </div>

                        {/* Top reason inline */}
                        {job.explain?.topReasonsToApply?.[0] && (
                          <p className="text-xs text-green-700 mt-2 line-clamp-1">
                            ✓ {job.explain.topReasonsToApply[0]}
                          </p>
                        )}
                        {job.explain?.topReasonsToHesitate?.[0] && (
                          <p className="text-xs text-yellow-700 line-clamp-1">
                            ⚠ {job.explain.topReasonsToHesitate[0]}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 w-28">
                        <div className="text-3xl font-bold text-primary leading-none">{job.matchScore}%</div>
                        <div className="text-xs text-gray-500 mt-0.5 mb-2">match</div>

                        {/* Mini subscore bars */}
                        {job.subscores && (
                          <div className="space-y-1">
                            {(["skillsSemantic", "titleAlignment", "locationFit"] as const).map(k => {
                              const s = job.subscores[k];
                              if (!s || s.weight === 0) return null;
                              return (
                                <div key={k}>
                                  <div className="w-full bg-gray-100 rounded-full h-1">
                                    <div className={`${bandColor(s.value)} h-1 rounded-full`} style={{ width: `${s.value * 100}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                      <Link href={`/jobs/${job.id}`}>
                        <a className="text-sm text-primary hover:underline font-medium">View full details →</a>
                      </Link>
                      <div className="flex-1" />
                      <button
                        onClick={() => handleBookmark(job)}
                        className="text-sm text-gray-600 hover:text-yellow-600 inline-flex items-center gap-1"
                      >
                        <Bookmark className="w-4 h-4" /> Save
                      </button>
                      <button
                        onClick={() => handleSwipe(job, "right")}
                        className="text-sm text-gray-600 hover:text-green-600 inline-flex items-center gap-1"
                      >
                        <Heart className="w-4 h-4" /> Like
                      </button>
                      <button
                        onClick={() => handleSwipe(job, "left")}
                        className="text-sm text-gray-600 hover:text-red-600 inline-flex items-center gap-1"
                      >
                        <X className="w-4 h-4" /> Skip
                      </button>
                      {job.externalUrl && (
                        <a
                          href={job.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-sm text-gray-600 hover:text-primary inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-4 h-4" /> Posting
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </main>
        </div>
      </div>

      <BottomNavigation currentPath="/" />
    </div>
  );
}

function SearchFilterBar({
  filters, onChange, chips,
}: { filters: FilterState; onChange: (f: FilterState) => void; chips: string[] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FilterState>(filters);
  // Sync drafted state when caller resets externally (e.g. Clear all).
  useEffect(() => { setDraft(filters); }, [filters]);

  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          placeholder="Search title, company, or keyword…"
          className="pl-9"
        />
      </div>

      <Select value={filters.sort} onValueChange={(v) => onChange({ ...filters, sort: v as SortMode })}>
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="relevance">Relevance</SelectItem>
          <SelectItem value="recent">Most recent</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(filters); }}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <SlidersHorizontal className="w-4 h-4 mr-2" />
            Filters
            {chips.length > 1 && (
              <Badge variant="secondary" className="ml-2 px-1.5 py-0">{chips.length - 1}</Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filter jobs</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Country</Label>
              <Select value={draft.country} onValueChange={(v) => setDraft({ ...draft, country: v as "us" | "any" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States only (default)</SelectItem>
                  <SelectItem value="any">Anywhere</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc">City or state</Label>
              <Input
                id="loc"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="e.g. New York, San Francisco, TX"
              />
            </div>

            <div className="space-y-2">
              <Label>Work mode</Label>
              <Select value={draft.remote} onValueChange={(v) => setDraft({ ...draft, remote: v as RemoteMode })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="remote">Remote only</SelectItem>
                  <SelectItem value="hybrid">Hybrid only</SelectItem>
                  <SelectItem value="onsite">On-site only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sal">Minimum salary (USD)</Label>
              <Input
                id="sal"
                type="number"
                inputMode="numeric"
                value={draft.salaryMin ?? ""}
                onChange={(e) => setDraft({ ...draft, salaryMin: e.target.value ? parseInt(e.target.value, 10) : null })}
                placeholder="e.g. 120000"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <Label htmlFor="visa" className="cursor-pointer">Visa sponsors only</Label>
              <Switch
                id="visa"
                checked={draft.visaOnly}
                onCheckedChange={(v) => setDraft({ ...draft, visaOnly: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDraft(DEFAULT_FILTERS); }}>
              Reset
            </Button>
            <Button onClick={() => { onChange(draft); setOpen(false); }}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

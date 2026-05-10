/**
 * JobDetail — full-screen job view with description, real subscore breakdown,
 * visa intel, and apply button.
 *
 * Used by:
 *   - /jobs/:id route page
 *   - inline expansion in the swipe interface (future)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, getQueryFn } from "@/lib/api";
import {
  MapPin, Building, Clock, Heart, Bookmark, ExternalLink,
  CheckCircle, AlertTriangle, Globe, DollarSign, ArrowLeft, Newspaper
} from "lucide-react";

const SUBSCORE_LABELS: Record<string, string> = {
  skillsSemantic:    "Skills match",
  titleAlignment:    "Title alignment",
  seniorityFit:      "Seniority fit",
  locationFit:       "Location",
  domainExperience:  "Domain experience",
  visaCompatibility: "Visa sponsorship",
  salaryFit:         "Salary fit",
  recencySignal:     "Posting freshness",
};

function formatSalary(min?: number | null, max?: number | null) {
  if (!min && !max) return null;
  if (min && max) return `$${(min / 1000).toFixed(0)}K – $${(max / 1000).toFixed(0)}K`;
  if (min) return `$${(min / 1000).toFixed(0)}K+`;
  return `Up to $${((max ?? 0) / 1000).toFixed(0)}K`;
}

function bandColor(value: number): string {
  if (value >= 0.75) return "bg-green-500";
  if (value >= 0.5) return "bg-blue-500";
  if (value >= 0.3) return "bg-yellow-500";
  return "bg-red-400";
}

function labelColor(label: string): string {
  if (label === "Strong fit") return "bg-green-100 text-green-800";
  if (label === "Promising fit") return "bg-blue-100 text-blue-800";
  if (label === "Stretch") return "bg-yellow-100 text-yellow-800";
  if (label === "Insufficient data") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

interface Props {
  job: any;
  onBack?: () => void;
}

export function JobDetail({ job, onBack }: Props) {
  const qc = useQueryClient();

  const interact = useMutation({
    mutationFn: async (action: string) => {
      const r = await apiRequest("POST", `/api/jobs/${job.id}/interact`, {
        action,
        matchScore: job.matchScore?.toString(),
        visaScore: job.visaScore?.toString(),
      });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/jobs/feed"] });
      qc.invalidateQueries({ queryKey: ["/api/jobs/liked"] });
    },
  });

  const apply = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", `/api/jobs/${job.id}/apply`, {});
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/applications"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
  });

  const handleApply = () => {
    apply.mutate();
    if (job.externalUrl) window.open(job.externalUrl, "_blank", "noopener");
  };

  const subscoreEntries = job.subscores
    ? Object.entries(job.subscores).filter(([, s]: [string, any]) => s.weight > 0)
    : [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* === LEFT 2/3: job description === */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-bold text-gray-900 leading-tight">{job.title}</h1>
                  <div className="flex items-center gap-2 mt-1.5 text-primary font-medium">
                    <Building className="w-4 h-4" />
                    <span>{job.company}</span>
                  </div>
                </div>
                {job.label && (
                  <Badge className={`${labelColor(job.label)} border-0 shrink-0`}>{job.label}</Badge>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 mt-3">
                {job.location && (
                  <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{job.location}</span>
                )}
                {job.type && (
                  <span className="inline-flex items-center gap-1 capitalize"><Clock className="w-4 h-4" />{job.type}</span>
                )}
                {(job.salaryMin || job.salaryMax) && (
                  <span className="inline-flex items-center gap-1"><DollarSign className="w-4 h-4" />{formatSalary(job.salaryMin, job.salaryMax)}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {job.isRemote && <Badge variant="outline" className="text-green-700 bg-green-50">Remote</Badge>}
                {job.isHybrid && <Badge variant="outline" className="text-blue-700 bg-blue-50">Hybrid</Badge>}
                {job.sponsorsVisa && <Badge variant="outline" className="text-purple-700 bg-purple-50">Visa sponsor</Badge>}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 mt-5 pt-5 border-t border-gray-100">
                <Button onClick={handleApply} className="flex-1" disabled={apply.isPending}>
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  {apply.isPending ? "Recording..." : job.externalUrl ? "Apply on company site" : "Mark as applied"}
                </Button>
                <Button variant="outline" onClick={() => interact.mutate("bookmark")} disabled={interact.isPending}>
                  <Bookmark className="w-4 h-4 mr-1.5" /> Save
                </Button>
                <Button variant="outline" onClick={() => interact.mutate("swipe_right")} disabled={interact.isPending}>
                  <Heart className="w-4 h-4 mr-1.5" /> Like
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-semibold text-gray-900 mb-3">About this role</h2>
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                {job.description || <em className="text-gray-400">No description available.</em>}
              </div>
            </CardContent>
          </Card>

          {/* Requirements */}
          {job.requirements && job.requirements.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="font-semibold text-gray-900 mb-3">Required skills</h2>
                <div className="flex flex-wrap gap-2">
                  {job.requirements.map((r: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-sm">{r}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* === RIGHT 1/3: match analysis === */}
        <div className="space-y-6">
          {typeof job.matchScore === "number" && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-baseline justify-between mb-1">
                  <h2 className="font-semibold text-gray-900">Match score</h2>
                  <span className="text-3xl font-bold text-primary">{job.matchScore}%</span>
                </div>
                {job.confidenceInterval && (
                  <div className="text-xs text-gray-500 mb-3">
                    90% CI: {Math.round(job.confidenceInterval[0] * 100)}% – {Math.round(job.confidenceInterval[1] * 100)}%
                  </div>
                )}

                <div className="space-y-2.5">
                  {subscoreEntries.map(([key, s]: [string, any]) => (
                    <div key={key}>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-700">{SUBSCORE_LABELS[key] ?? key}</span>
                        <span className="text-gray-500">{Math.round(s.value * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                        <div
                          className={`${bandColor(s.value)} h-1.5 rounded-full transition-all`}
                          style={{ width: `${Math.round(s.value * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {job.explain?.topReasonsToApply?.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Why apply</h3>
                    <ul className="space-y-1.5">
                      {job.explain.topReasonsToApply.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {job.explain?.topReasonsToHesitate?.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Heads-up</h3>
                    <ul className="space-y-1.5">
                      {job.explain.topReasonsToHesitate.map((r: string, i: number) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 mt-0.5 shrink-0" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {job.visaIntel && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-purple-600" />
                  <h2 className="font-semibold text-gray-900">Visa intelligence</h2>
                </div>
                <p className="text-sm text-gray-700">{job.visaIntel.summary}</p>
                {job.visaIntel.stats24mo?.totalLcas > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-gray-50 rounded px-2 py-1.5">
                      <div className="text-gray-500">LCAs (24 mo)</div>
                      <div className="font-semibold">{job.visaIntel.stats24mo.totalLcas}</div>
                    </div>
                    <div className="bg-gray-50 rounded px-2 py-1.5">
                      <div className="text-gray-500">Approved</div>
                      <div className="font-semibold">
                        {job.visaIntel.certificationRate24mo
                          ? `${Math.round(job.visaIntel.certificationRate24mo * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                )}
                {job.visaIntel.warnings?.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {job.visaIntel.warnings.map((w: string, i: number) => (
                      <li key={i} className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1.5">
                        ⚠️ {w}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}

          <CompanyIntelCard company={job.company} />
        </div>
      </div>
    </div>
  );
}

function CompanyIntelCard({ company }: { company: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${encodeURIComponent(company)}/intel`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 6 * 60 * 60 * 1000,    // 6h client-side cache too
    enabled: !!company,
  });

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-semibold text-gray-900 mb-3">About {company}</h2>

        {isLoading && <p className="text-xs text-gray-400">Loading…</p>}

        {data?.wiki && (
          <div className="mb-4">
            <div className="flex items-start gap-3">
              {data.wiki.thumbnailUrl && (
                <img
                  src={data.wiki.thumbnailUrl}
                  alt=""
                  className="w-16 h-16 rounded object-cover shrink-0 border border-gray-200"
                />
              )}
              <div className="min-w-0 flex-1">
                {data.wiki.description && (
                  <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{data.wiki.description}</p>
                )}
                {data.wiki.extract && (
                  <p className="text-sm text-gray-700 leading-snug line-clamp-4">{data.wiki.extract}</p>
                )}
                {data.wiki.pageUrl && (
                  <a
                    href={data.wiki.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-0.5"
                  >
                    Wikipedia <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {data?.news?.length > 0 && (
          <div className={data.wiki ? "border-t border-gray-100 pt-3" : ""}>
            <div className="flex items-center gap-1.5 mb-2">
              <Newspaper className="w-3.5 h-3.5 text-gray-500" />
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Recent news</h3>
            </div>
            <ul className="space-y-2">
              {data.news.slice(0, 4).map((n: any, i: number) => (
                <li key={i}>
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-700 hover:text-primary leading-snug line-clamp-2 block"
                  >
                    {n.title}
                  </a>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {n.source && <span>{n.source}</span>}
                    {n.source && n.publishedAt && <span> · </span>}
                    {n.publishedAt && <span>{new Date(n.publishedAt).toLocaleDateString()}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isLoading && !data?.wiki && !data?.news?.length && (
          <p className="text-xs text-gray-500">No public profile or recent news found for "{company}".</p>
        )}
      </CardContent>
    </Card>
  );
}

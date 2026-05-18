/**
 * JobDetail — full-screen job view with description, real subscore breakdown,
 * visa intel, and apply button.
 *
 * Used by:
 *   - /jobs/:id route page
 *   - inline expansion in the swipe interface (future)
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, getQueryFn } from "@/lib/api";
import { GenerateDocsButton } from "@/components/GenerateDocsButton";
import {
  MapPin, Building, Clock, Heart, Bookmark, ExternalLink,
  CheckCircle, AlertTriangle, Globe, DollarSign, ArrowLeft, Newspaper,
  Sparkles, Chrome, TrendingUp, Briefcase
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

  // Whether the JD is expanded — drives layout reflow. Long JD (>700 chars) starts
  // collapsed so the right-side intel cards can spill into the wider layout below.
  const longJd = (job.description?.length ?? 0) > 700;
  const [jdExpanded, setJdExpanded] = useState(!longJd);

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

      <div className={jdExpanded ? "grid grid-cols-1 lg:grid-cols-3 gap-6" : "space-y-6"}>
        {/* === HEADER + DESCRIPTION column === */}
        <div className={jdExpanded ? "lg:col-span-2 space-y-6" : "space-y-6"}>
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

              {/* Three apply paths */}
              <div className="mt-5 pt-5 border-t border-gray-100 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Mode 1: SwipeHire-direct (Tier 1 auto-submit) — coming soon */}
                  <Button
                    variant="outline"
                    className="border-dashed text-gray-400 cursor-not-allowed"
                    disabled
                    title="Coming soon: auto-submit via Greenhouse / Lever / Ashby APIs"
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    Apply via SwipeHire
                  </Button>

                  {/* Mode 2: Apply on company site (Tier 3 deep-link, current default).
                      Real anchor element (not window.open) so popup blockers can't
                      swallow the navigation. Click also fires the apply mutation
                      in the background to record it for the dashboard. */}
                  {job.externalUrl ? (
                    <a
                      href={job.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => apply.mutate()}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
                      title="Open the company posting in a new tab and record this as applied"
                    >
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Apply on company site
                    </a>
                  ) : (
                    <Button disabled title="No external link available">
                      <ExternalLink className="w-4 h-4 mr-1.5" />
                      Apply on company site
                    </Button>
                  )}

                  {/* Mode 3: Apply with extension (Tier 2 assisted, when extension is installed) */}
                  <Button
                    variant="outline"
                    className="border-dashed text-gray-400 cursor-not-allowed"
                    disabled
                    title="Coming soon: Chrome extension auto-fills any career page"
                  >
                    <Chrome className="w-4 h-4 mr-1.5" />
                    Apply with extension
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => interact.mutate("bookmark")} disabled={interact.isPending}>
                    <Bookmark className="w-4 h-4 mr-1.5" /> Save
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => interact.mutate("swipe_right")} disabled={interact.isPending}>
                    <Heart className="w-4 h-4 mr-1.5" /> Like
                  </Button>
                </div>

                <GenerateDocsButton jobId={job.id} jobTitle={job.title} companyName={job.company} />

                <p className="text-[11px] text-gray-400 leading-snug pt-1">
                  Current path: deep-link to the company's posting + log the application here so we can track outcomes.
                  SwipeHire-direct submission and the auto-fill extension ship in a future release.
                </p>
              </div>
            </CardContent>
          </Card>

          <CollapsibleDescription
            description={job.description}
            expanded={jdExpanded}
            onToggle={() => setJdExpanded(v => !v)}
          />

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

        {/* === INTEL column: right-side when expanded, 2-col grid below when collapsed === */}
        <div className={jdExpanded ? "space-y-6" : "grid grid-cols-1 md:grid-cols-2 gap-6 items-start"}>
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

          {job.visaIntel && <VisaIntelCard intel={job.visaIntel} role={job.title} company={job.company} />}

          <CompanyHiringStatsCard company={job.company} role={job.title} />
          <LevelsFyiCard company={job.company} role={job.title} />
          <CompanyFinancialsCard company={job.company} />
          <CompanyIntelCard company={job.company} />
        </div>
      </div>
    </div>
  );
}

function fmtSalary(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n}`;
}

function VisaIntelCard({ intel, role, company }: { intel: any; role: string; company: string }) {
  const has24mo = intel.stats24mo?.totalLcas > 0;
  const roleSpecific = intel.roleSpecific;
  const yearTotals: Array<{ year: number; totalLcas: number; certified: number }> = intel.yearTotals ?? [];
  const lcas2025 = yearTotals.find(y => y.year === 2025);
  const certRatePct = intel.certificationRate24mo != null
    ? `${Math.round(intel.certificationRate24mo * 100)}%` : "–";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <Globe className="w-4 h-4 text-purple-600" />
          <h2 className="font-semibold text-gray-900">Visa intelligence</h2>
        </div>
        <p className="text-sm text-gray-700">{intel.summary}</p>

        {has24mo && (
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            <div className="bg-gray-50 rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Company LCAs (24 mo)</div>
              <div className="font-semibold text-gray-900 text-base">{intel.stats24mo.totalLcas.toLocaleString()}</div>
            </div>
            <div className="bg-gray-50 rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Approved</div>
              <div className="font-semibold text-gray-900 text-base">{certRatePct}</div>
            </div>
            <div className="bg-gray-50 rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">2025 H-1B filings</div>
              <div className="font-semibold text-gray-900 text-base">
                {lcas2025 ? lcas2025.totalLcas.toLocaleString() : "0"}
              </div>
            </div>
            <div className="bg-gray-50 rounded px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Median wage</div>
              <div className="font-semibold text-gray-900 text-base">
                {intel.stats24mo.medianWageOffered
                  ? `$${Math.round(intel.stats24mo.medianWageOffered / 1000)}K`
                  : "–"}
              </div>
            </div>
          </div>
        )}

        {/* For THIS role specifically */}
        {(intel.fein || roleSpecific) && (
          <div className="border-t border-gray-100 mt-3 pt-3">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              For this role {roleSpecific?.socCode && <span className="text-gray-400 font-normal normal-case">(SOC {roleSpecific.socCode})</span>}
            </div>
            {roleSpecific?.found ? (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{company} LCAs for this SOC (24 mo)</span>
                  <span className="font-medium text-gray-900">{roleSpecific.totalLcas24mo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Approved</span>
                  <span className="font-medium text-gray-900">
                    {roleSpecific.totalLcas24mo > 0
                      ? `${Math.round((roleSpecific.certified / roleSpecific.totalLcas24mo) * 100)}%`
                      : "–"}
                  </span>
                </div>
                {roleSpecific.medianWageOffered && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Median wage offered</span>
                    <span className="font-medium text-gray-900">${Math.round(roleSpecific.medianWageOffered / 1000)}K</span>
                  </div>
                )}
                {roleSpecific.lastSponsoredAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Last sponsored for this SOC</span>
                    <span className="font-medium text-gray-900">{new Date(roleSpecific.lastSponsoredAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                No record of {company} sponsoring an H-1B in this exact SOC code in the last 24 months.
                {has24mo && (
                  <span className="text-gray-500"> They have filed under other SOCs; see company numbers above.</span>
                )}
              </p>
            )}
          </div>
        )}

        {intel.warnings?.length > 0 && (
          <ul className="mt-3 space-y-1">
            {intel.warnings.map((w: string, i: number) => (
              <li key={i} className="text-xs text-yellow-800 bg-yellow-50 rounded px-2 py-1.5">
                ⚠️ {w}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "–";
  const d = new Date(s);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "~1 month ago";
  if (days < 180) return `~${Math.round(days / 30)} months ago`;
  return d.toLocaleDateString();
}

function CompanyHiringStatsCard({ company, role }: { company: string; role: string }) {
  const url = `/api/companies/${encodeURIComponent(company)}/hiring-stats?role=${encodeURIComponent(role.split(",")[0].trim())}`;
  const { data } = useQuery<any>({
    queryKey: [url],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60 * 60 * 1000,    // 1h client cache
    enabled: !!company,
  });

  if (!data?.hasData) return null;

  // Compute max for sparkline scaling.
  const trend = data.quarterlyPostings ?? [];
  const maxQ = Math.max(1, ...trend.map((q: any) => q.count));
  const last30 = data.velocity.last30d;
  const prev30 = Math.max(0, data.velocity.last90d - last30);    // approx 30-60 days ago
  const trendArrow = last30 > prev30 ? "↑" : last30 < prev30 ? "↓" : "→";
  const trendColor = last30 > prev30 ? "text-green-600" : last30 < prev30 ? "text-red-600" : "text-gray-500";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-gray-900">Hiring at {company}</h2>
        </div>

        {/* Big headline number */}
        <div className="bg-gradient-to-br from-primary/5 to-blue-50 rounded-lg p-4 mb-3">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-3xl font-bold text-gray-900">{data.activeJobs.total.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-0.5">active openings</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${trendColor}`}>{trendArrow} {last30}</div>
              <div className="text-xs text-gray-500 mt-0.5">in last 30 days</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs">
            {data.activeJobs.visaSponsor > 0 && (
              <span className="inline-flex items-center gap-1 text-purple-700">
                <Globe className="w-3 h-3" />
                {data.activeJobs.visaSponsor} sponsor visa
              </span>
            )}
            {data.activeJobs.remote > 0 && (
              <span className="inline-flex items-center gap-1 text-green-700">
                🌐 {data.activeJobs.remote} remote
              </span>
            )}
            {data.activeJobs.hybrid > 0 && (
              <span className="inline-flex items-center gap-1 text-blue-700">
                🏢 {data.activeJobs.hybrid} hybrid
              </span>
            )}
          </div>
        </div>

        {/* Quarterly sparkline */}
        {trend.length >= 2 && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-2">Posting volume by quarter</div>
            <div className="flex items-end justify-between gap-1 h-16">
              {trend.map((q: any, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    className="w-full bg-primary/60 rounded-t hover:bg-primary transition-colors"
                    style={{ height: `${Math.max(4, (q.count / maxQ) * 56)}px` }}
                    title={`${q.count} jobs`}
                  />
                  <div className="text-[9px] text-gray-400">
                    Q{Math.floor((new Date(q.quarter).getMonth() / 3)) + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-gray-600 mb-3">
          <Clock className="inline w-3 h-3 mr-1" />
          Latest posting: <span className="font-medium text-gray-900">{fmtDate(data.velocity.latestPostedAt)}</span>
          <span className="text-gray-400"> · {data.velocity.last90d} in 90 days · {data.velocity.last180d} in 180</span>
        </div>

        {data.roleSpecific && (
          <div className="border-t border-gray-100 pt-3 mb-3">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              For roles like this
            </div>
            <div className="text-sm text-gray-700">
              {data.roleSpecific.matches} similar opening{data.roleSpecific.matches > 1 ? "s" : ""}
              {data.roleSpecific.p50SalaryMin && data.roleSpecific.p50SalaryMax && (
                <> · median band <span className="font-medium text-gray-900">
                  {fmtSalary(data.roleSpecific.p50SalaryMin)}–{fmtSalary(data.roleSpecific.p50SalaryMax)}
                </span></>
              )}
            </div>
            {data.roleSpecific.salaryMinLow && data.roleSpecific.salaryMaxHigh && (
              <div className="text-xs text-gray-500 mt-0.5">
                Full range: {fmtSalary(data.roleSpecific.salaryMinLow)}–{fmtSalary(data.roleSpecific.salaryMaxHigh)}
              </div>
            )}
          </div>
        )}

        {data.salary && !data.roleSpecific && (
          <div className="border-t border-gray-100 pt-3 mb-3">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
              Salary across all roles ({data.salary.jobsWithSalary} listings)
            </div>
            <div className="text-sm text-gray-700">
              {fmtSalary(data.salary.min)}–{fmtSalary(data.salary.max)}
              {data.salary.median && (
                <span className="text-gray-500"> · median {fmtSalary(data.salary.median)}</span>
              )}
            </div>
          </div>
        )}

        {data.topRoles?.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Where they're hiring
            </div>
            {(() => {
              const totalRoleCount = data.topRoles.reduce((a: number, r: any) => a + r.count, 0);
              return (
                <div className="space-y-2">
                  {data.topRoles.slice(0, 5).map((r: any) => {
                    const pct = (r.count / totalRoleCount) * 100;
                    return (
                      <div key={r.role}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-700">{r.role}</span>
                          <span className="text-gray-500">{r.count}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-primary/70 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </CardContent>
    </Card>
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

/** Slugify company name for levels.fyi URLs (lowercase, hyphenated, no entity suffixes). */
function levelsFyiSlug(company: string): string {
  return company
    .toLowerCase()
    .replace(/[,.()'"]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^the-/, '')
    .replace(/-(inc|llc|corp|co|ltd|limited)$/, '');
}

/** Levels.fyi only embeds these job families. For others, fall back to deep-links. */
const LEVELS_TRACKS = [
  'Software Engineer', 'Product Manager', 'Product Designer',
  'Data Scientist', 'Software Engineering Manager',
] as const;

/** Map a job title to a Levels.fyi track (or null if not supported). */
function detectLevelsTrack(title: string): string | null {
  const t = title.toLowerCase();
  if (/\b(software|backend|frontend|full[- ]stack|swe|sde)\b.*(engineer|developer)/.test(t)) return 'Software Engineer';
  if (/\b(machine learning|ml|ai)\s+engineer/.test(t)) return 'Software Engineer';
  if (/\b(engineer|developer)\b/.test(t) && /\b(senior|staff|principal|lead)\b/.test(t)) return 'Software Engineer';
  if (/\bproduct manager\b|\bpm\b/.test(t)) return 'Product Manager';
  if (/\bproduct designer\b|\bux designer\b|\bui designer\b/.test(t)) return 'Product Designer';
  if (/\bdata scientist\b|\bapplied scientist\b|\bml scientist\b/.test(t)) return 'Data Scientist';
  if (/\b(engineering manager|software engineering manager|swe manager)\b/.test(t)) return 'Software Engineering Manager';
  if (/\bengineer|developer\b/.test(t)) return 'Software Engineer';   // catch-all
  return null;
}

function LevelsFyiCard({ company, role }: { company: string; role: string }) {
  const slug = levelsFyiSlug(company);
  const salariesUrl = `https://www.levels.fyi/companies/${slug}/salaries`;
  const levelingUrl = `https://www.levels.fyi/companies/${slug}/levels`;
  const track = detectLevelsTrack(role);
  // Official Levels.fyi embeds (per Available Embeds docs).
  // Salary chart: charts_embed.html?company=X&track=Y&hide_selector=true
  // Leveling:     levels_embed.html?compare=X&track=Y
  const salaryEmbed = track
    ? `https://www.levels.fyi/charts_embed.html?company=${encodeURIComponent(company)}&track=${encodeURIComponent(track)}&hide_selector=true`
    : null;
  const levelEmbed = track
    ? `https://www.levels.fyi/levels_embed.html?compare=${encodeURIComponent(company)}&track=${encodeURIComponent(track)}`
    : null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="w-4 h-4 text-green-600" />
          <h2 className="font-semibold text-gray-900">Compensation &amp; leveling</h2>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Powered by <a href="https://www.levels.fyi" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Levels.fyi</a>
          {track ? <> · {track}</> : <> · role not in Levels.fyi families ({LEVELS_TRACKS.slice(0, 3).join(', ')}, ...)</>}
        </p>

        {salaryEmbed ? (
          <div className="mb-3 rounded-lg overflow-hidden border border-gray-200" style={{ height: 500 }}>
            <iframe
              src={salaryEmbed}
              title={`Levels.fyi salaries: ${company}`}
              loading="lazy"
              className="w-full h-full"
              style={{ border: 'none' }}
              scrolling="auto"
            />
          </div>
        ) : (
          <p className="text-sm text-gray-600 mb-3">
            Levels.fyi embeds support Software Engineer, Product Manager, Product Designer, Data Scientist, and Engineering Manager roles. Use the deep-links below for this role.
          </p>
        )}

        {levelEmbed && (
          <details className="mb-3">
            <summary className="text-sm text-gray-700 cursor-pointer hover:text-primary font-medium py-2">
              Show leveling map →
            </summary>
            <div className="mt-2 rounded-lg overflow-hidden border border-gray-200" style={{ height: 600 }}>
              <iframe
                src={levelEmbed}
                title={`Levels.fyi leveling: ${company}`}
                loading="lazy"
                className="w-full h-full"
                style={{ border: 'none' }}
                scrolling="auto"
              />
            </div>
          </details>
        )}

        <div className="space-y-1.5 mt-3 pt-3 border-t border-gray-100">
          <a
            href={salariesUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 text-xs text-gray-600 hover:text-primary"
          >
            <span>Open full salaries page on Levels.fyi</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={levelingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-2 text-xs text-gray-600 hover:text-primary"
          >
            <span>Open full leveling map</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

/** Collapsible job description — controlled by parent so layout can reflow. */
function CollapsibleDescription({
  description,
  expanded,
  onToggle,
}: {
  description?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const text = description ?? '';
  const PREVIEW_CHARS = 600;
  const needsCollapse = text.length > PREVIEW_CHARS + 100;
  const visible = !needsCollapse || expanded ? text : text.slice(0, PREVIEW_CHARS);

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="font-semibold text-gray-900 mb-3">About this role</h2>
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
          {text ? (
            <>
              {visible}
              {needsCollapse && !expanded && <span className="text-gray-400">…</span>}
            </>
          ) : (
            <em className="text-gray-400">No description available.</em>
          )}
        </div>
        {needsCollapse && (
          <button
            type="button"
            onClick={onToggle}
            className="mt-3 text-sm font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1"
          >
            {expanded ? 'Read less' : 'Read more'}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/** Company financials from SEC EDGAR (public companies only). */
function CompanyFinancialsCard({ company }: { company: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: [`/api/companies/${encodeURIComponent(company)}/financials`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 7 * 24 * 60 * 60 * 1000,
    enabled: !!company,
    retry: false,
  });

  if (isLoading) return null;
  if (!data?.found) return null;

  const fmtMoney = (n: number | null | undefined): string => {
    if (n == null) return '–';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
    return `$${n.toLocaleString()}`;
  };
  const fmtPct = (n: number | null | undefined): string => {
    if (n == null) return '–';
    return `${(n * 100).toFixed(1)}%`;
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <Briefcase className="w-4 h-4 text-blue-600" /> Financials
          </h2>
          {data.ticker && (
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{data.ticker}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-gray-50 rounded px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Revenue (last FY)</div>
            <div className="font-semibold text-gray-900">{fmtMoney(data.revenue)}</div>
            {data.revenueGrowthYoy != null && (
              <div className={`text-[10px] mt-0.5 ${data.revenueGrowthYoy >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {data.revenueGrowthYoy >= 0 ? '↑' : '↓'} {fmtPct(Math.abs(data.revenueGrowthYoy))} YoY
              </div>
            )}
          </div>
          <div className="bg-gray-50 rounded px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Operating margin</div>
            <div className="font-semibold text-gray-900">{fmtPct(data.operatingMargin)}</div>
            {data.operatingIncome != null && (
              <div className="text-[10px] text-gray-500 mt-0.5">{fmtMoney(data.operatingIncome)} op income</div>
            )}
          </div>
          <div className="bg-gray-50 rounded px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Net income</div>
            <div className="font-semibold text-gray-900">{fmtMoney(data.netIncome)}</div>
          </div>
          <div className="bg-gray-50 rounded px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Cash &amp; equivalents</div>
            <div className="font-semibold text-gray-900">{fmtMoney(data.cash)}</div>
          </div>
        </div>

        {data.fiscalYearEnd && (
          <p className="text-[10px] text-gray-400 leading-snug">
            FY {data.fiscalYear} (ended {new Date(data.fiscalYearEnd).toLocaleDateString()}).
            Source: <a href={data.secUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">SEC EDGAR 10-K</a>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * /liked — list view of jobs the user has swiped right on or bookmarked.
 *
 * Each row shows the calibrated match score, label, top reasons,
 * and clicks through to the full /jobs/:id detail view.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getQueryFn } from "@/lib/api";
import { TopNavigation } from "@/components/TopNavigation";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Building, ExternalLink, Clock } from "lucide-react";

function labelColor(label: string): string {
  if (label === "Strong fit") return "bg-green-100 text-green-800";
  if (label === "Promising fit") return "bg-blue-100 text-blue-800";
  if (label === "Stretch") return "bg-yellow-100 text-yellow-800";
  if (label === "Insufficient data") return "bg-gray-100 text-gray-700";
  return "bg-red-100 text-red-700";
}

function actionLabel(a?: string): string {
  if (a === "swipe_right") return "Liked";
  if (a === "bookmark") return "Saved";
  return a ?? "";
}

export default function Liked() {
  const { data: meData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const { data, isLoading } = useQuery<{ jobs: any[]; count: number }>({
    queryKey: ["/api/jobs/liked"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const jobs = data?.jobs ?? [];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <TopNavigation user={meData?.user} />
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" />
            Liked & saved
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {jobs.length === 0
              ? "Jobs you swipe right on or bookmark will show up here."
              : `${jobs.length} job${jobs.length === 1 ? "" : "s"} you've liked or saved.`}
          </p>
        </header>

        {isLoading && <div className="text-gray-500 py-8">Loading...</div>}

        {!isLoading && jobs.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center">
              <Heart className="w-12 h-12 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">Nothing here yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Head to <Link href="/" className="text-primary hover:underline">Discover</Link> to start swiping.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {jobs.map(job => (
            <Link key={job.id} href={`/jobs/${job.id}`}>
              <Card className="cursor-pointer hover:border-primary hover:shadow-sm transition-all">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {actionLabel(job.interactionAction)}
                        </Badge>
                        {job.label && (
                          <Badge className={`${labelColor(job.label)} border-0 text-xs`}>
                            {job.label}
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-900 text-base sm:text-lg leading-snug">{job.title}</h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <Building className="w-3.5 h-3.5" />
                          {job.company}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.location}
                        </span>
                      </div>
                      {job.explain?.topReasonsToApply?.[0] && (
                        <p className="text-xs text-gray-500 mt-2 line-clamp-1">
                          ✓ {job.explain.topReasonsToApply[0]}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {actionLabel(job.interactionAction)} {new Date(job.interactionAt).toLocaleDateString()}
                        </span>
                        {job.externalUrl && (
                          <span className="inline-flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            view on company site
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold text-primary leading-none">{job.matchScore}%</div>
                      <div className="text-xs text-gray-500 mt-0.5">match</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
      <BottomNavigation currentPath="/liked" />
    </div>
  );
}

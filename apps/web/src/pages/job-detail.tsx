/**
 * /jobs/:id — full job detail view.
 *
 * Loads a single scored job and renders the JobDetail component.
 */

import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { getQueryFn } from "@/lib/api";
import { TopNavigation } from "@/components/TopNavigation";
import { BottomNavigation } from "@/components/BottomNavigation";
import { JobDetail } from "@/components/JobDetail";
import { Card, CardContent } from "@/components/ui/card";

export default function JobDetailPage() {
  const [, params] = useRoute("/jobs/:id");
  const id = params?.id;

  const { data: meData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/jobs/${id}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!id,
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      <TopNavigation user={meData?.user} />
      {isLoading && <div className="max-w-5xl mx-auto px-4 py-8 text-gray-500">Loading job...</div>}
      {error && (
        <div className="max-w-5xl mx-auto px-4 py-8">
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-gray-700 font-medium">Couldn't load this job</p>
              <p className="text-sm text-gray-500 mt-1">
                It may have been removed. <Link href="/" className="text-primary hover:underline">Back to discover</Link>.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      {data && <JobDetail job={data} onBack={() => window.history.back()} />}
      <BottomNavigation currentPath="" />
    </div>
  );
}

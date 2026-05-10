import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/api";
import { SwipeInterface } from "@/components/SwipeInterface";
import { ResumeTailoringModal } from "@/components/ResumeTailoringModal";
import { BottomNavigation } from "@/components/BottomNavigation";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { Briefcase, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function Jobs() {
  const [showResumeTailoringModal, setShowResumeTailoringModal] = useState(false);
  const [currentTailoredResume, setCurrentTailoredResume] = useState<any>(null);
  const [currentJob, setCurrentJob] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['/api/jobs/feed'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const interactMutation = useMutation({
    mutationFn: async ({ jobId, action, matchScore, visaScore }: {
      jobId: number;
      action: string;
      matchScore?: number;
      visaScore?: number;
    }) => {
      const response = await apiRequest("POST", `/api/jobs/${jobId}/interact`, {
        action,
        matchScore: matchScore?.toString(),
        visaScore: visaScore?.toString(),
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/jobs/feed'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      
      if (data.showResumeTailoringModal) {
        setCurrentTailoredResume(data.tailoredResume);
        setCurrentJob(jobsData?.jobs.find((job: any) => job.id === data.interaction.jobId));
        setShowResumeTailoringModal(true);
      }
    },
  });

  const applyMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const response = await apiRequest("POST", `/api/jobs/${jobId}/apply`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/stats'] });
      setShowResumeTailoringModal(false);
    },
  });

  const handleSwipe = (job: any, direction: 'left' | 'right') => {
    const action = direction === 'right' ? 'swipe_right' : 'swipe_left';
    interactMutation.mutate({
      jobId: job.id,
      action,
      matchScore: job.matchScore,
      visaScore: job.visaScore,
    });
  };

  const handleBookmark = (job: any) => {
    interactMutation.mutate({
      jobId: job.id,
      action: 'bookmark',
    });
  };

  const handleApply = (jobId: number) => {
    applyMutation.mutate(jobId);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading jobs...</div>
      </div>
    );
  }

  const jobs = jobsData?.jobs || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
      {/* Navigation Header */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <SwipeHireLogo size="md" />
          <button className="p-2 rounded-lg hover:bg-gray-100">
            <div className="w-6 h-6 bg-brand-gray rounded-full"></div>
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <div className="max-w-md mx-auto pb-20">
        {/* User Status Bar */}
        {user && (
          <div className="bg-white mx-4 mt-4 p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-success rounded-full"></div>
                <span className="text-sm text-gray-600">
                  Looking for: <span className="font-medium text-gray-900">
                    {user.targetJobTitle || 'Any position'}
                  </span>
                </span>
              </div>
              {user.visaStatus && user.visaStatus !== 'citizen' && (
                <div className="flex items-center space-x-1 bg-secondary/10 px-2 py-1 rounded-full">
                  <Globe className="w-3 h-3 text-secondary" />
                  <span className="text-xs font-medium text-secondary">
                    {user.visaStatus.toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>
                📍 {user.preferredLocation || 'Flexible location'}
              </span>
              <span>
                🏠 {user.remotePreference === 'remote' ? 'Remote OK' : 
                     user.remotePreference === 'hybrid' ? 'Hybrid OK' : 'On-site'}
              </span>
            </div>
          </div>
        )}

        {/* Job Swipe Interface */}
        {jobs.length > 0 ? (
          <SwipeInterface
            jobs={jobs}
            onSwipe={handleSwipe}
            onBookmark={handleBookmark}
            user={user}
          />
        ) : (
          <Card className="mx-4 mt-6">
            <CardContent className="p-8 text-center">
              <div className="text-gray-500 mb-4">
                <Briefcase className="w-12 h-12 mx-auto mb-2" />
                <p>No more jobs available right now.</p>
                <p className="text-sm mt-2">Check back later for new opportunities!</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Stats */}
        {statsData?.todayStats && (
          <div className="mx-4 mt-8 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Today's Progress</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-primary">{statsData.todayStats.viewed}</div>
                <div className="text-xs text-gray-500">Viewed</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-success">{statsData.todayStats.liked}</div>
                <div className="text-xs text-gray-500">Liked</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-warning">{statsData.todayStats.applied}</div>
                <div className="text-xs text-gray-500">Applied</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Resume Tailoring Modal */}
      <ResumeTailoringModal
        isOpen={showResumeTailoringModal}
        onClose={() => setShowResumeTailoringModal(false)}
        job={currentJob}
        tailoredResume={currentTailoredResume}
        onApply={handleApply}
      />

      {/* Bottom Navigation */}
      <BottomNavigation currentPath="/" />
    </div>
  );
}

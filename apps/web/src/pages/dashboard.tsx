import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/api";
import { BottomNavigation } from "@/components/BottomNavigation";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, FileText, Clock, CheckCircle } from "lucide-react";

export default function Dashboard() {
  const { data: statsData, isLoading } = useQuery({
    queryKey: ['/api/dashboard/stats'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-lg">Loading dashboard...</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'interview':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'offer':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-md mx-auto">
          <SwipeHireLogo size="md" className="mb-2" />
          <h1 className="text-xl font-bold text-gray-900">SwipeHire™ Dashboard</h1>
          <p className="text-sm text-gray-500">Visa-friendly job matching progress</p>
        </div>
      </div>

      <div className="max-w-md mx-auto p-6 space-y-6 pb-20">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-2xl font-bold text-primary">
                    {statsData?.totalApplications || 0}
                  </div>
                  <div className="text-sm text-gray-600">Applications Sent</div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 text-success" />
                <div>
                  <div className="text-2xl font-bold text-success">
                    {statsData?.responseRate || 0}%
                  </div>
                  <div className="text-sm text-gray-600">Response Rate</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Progress */}
        {statsData?.todayStats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Today's Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xl font-bold text-primary">
                    {statsData.todayStats.viewed}
                  </div>
                  <div className="text-xs text-gray-500">Jobs Viewed</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-success">
                    {statsData.todayStats.liked}
                  </div>
                  <div className="text-xs text-gray-500">Jobs Liked</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-warning">
                    {statsData.todayStats.applied}
                  </div>
                  <div className="text-xs text-gray-500">Applied</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Applications */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Applications</CardTitle>
          </CardHeader>
          <CardContent>
            {statsData?.recentApplications && statsData.recentApplications.length > 0 ? (
              <div className="space-y-3">
                {statsData.recentApplications.map((application: any) => (
                  <div key={application.id} className="flex items-center justify-between py-2">
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {application.jobTitle} - {application.company}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center space-x-2">
                        <Clock className="w-3 h-3" />
                        <span>
                          Applied {new Date(application.appliedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Badge className={`${getStatusColor(application.status)} border-0`}>
                      {application.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                      {application.status === 'interview' && <CheckCircle className="w-3 h-3 mr-1" />}
                      {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No applications yet</p>
                <p className="text-sm mt-1">Start swiping on jobs to build your application history!</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Application Status Breakdown */}
        {statsData?.recentApplications && statsData.recentApplications.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Application Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(
                  statsData.recentApplications.reduce((acc: any, app: any) => {
                    acc[app.status] = (acc[app.status] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">{status}</span>
                    <Badge className={`${getStatusColor(status)} border-0`}>
                      {count as number}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <BottomNavigation currentPath="/dashboard" />
    </div>
  );
}

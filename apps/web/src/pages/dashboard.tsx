import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn, apiRequest } from "@/lib/api";
import { BottomNavigation } from "@/components/BottomNavigation";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, FileText, Clock, CheckCircle, ExternalLink, ThumbsDown, Calendar, Award, Pause } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const OUTCOME_BUTTONS: Array<{ value: string; label: string; icon: any; cls: string }> = [
  { value: 'interview', label: 'Interview',   icon: Calendar,    cls: 'bg-green-50 text-green-700 hover:bg-green-100 border-green-300' },
  { value: 'offer',     label: 'Got offer!',  icon: Award,       cls: 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-300' },
  { value: 'rejected',  label: 'Rejected',    icon: ThumbsDown,  cls: 'bg-red-50 text-red-700 hover:bg-red-100 border-red-300' },
  { value: 'no_response', label: 'No reply',  icon: Pause,       cls: 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-300' },
];

const STATUS_COLOR: Record<string, string> = {
  pending:     'bg-yellow-100 text-yellow-800',
  interview:   'bg-green-100 text-green-800',
  offer:       'bg-blue-100 text-blue-800',
  rejected:    'bg-red-100 text-red-800',
  no_response: 'bg-gray-100 text-gray-800',
  withdrew:    'bg-gray-100 text-gray-800',
};

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stats } = useQuery<any>({
    queryKey: ['/api/dashboard/stats'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: appsData, isLoading: appsLoading } = useQuery<{ applications: any[] }>({
    queryKey: ['/api/applications'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const setOutcome = useMutation({
    mutationFn: async ({ id, outcome }: { id: number; outcome: string }) => {
      const r = await apiRequest('POST', `/api/applications/${id}/outcome`, { outcome });
      return r.json();
    },
    onSuccess: (_data, vars) => {
      toast({
        title: 'Logged',
        description: `Outcome "${vars.outcome.replace('_', ' ')}" recorded — feeds the calibration model.`,
      });
      qc.invalidateQueries({ queryKey: ['/api/applications'] });
      qc.invalidateQueries({ queryKey: ['/api/honesty'] });
    },
    onError: (err: any) => {
      toast({ title: 'Failed', description: err.message, variant: 'destructive' });
    },
  });

  const apps = appsData?.applications ?? [];
  const openApps = apps.filter(a => a.status === 'pending');
  const closedApps = apps.filter(a => a.status !== 'pending');
  const today = stats?.todayStats ?? { viewed: 0, liked: 0, applied: 0 };
  const lifetime = stats?.lifetime ?? { viewed: 0, liked: 0, applied: 0 };

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto">
          <SwipeHireLogo size="md" className="mb-1" />
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Visa-aware job matching progress</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{lifetime.viewed}</div>
              <div className="text-xs text-gray-600 mt-0.5">Jobs viewed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{lifetime.liked}</div>
              <div className="text-xs text-gray-600 mt-0.5">Liked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{apps.length}</div>
              <div className="text-xs text-gray-600 mt-0.5">Applied</div>
            </CardContent>
          </Card>
        </div>

        {today.viewed + today.liked + today.applied > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Today</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div className="text-center"><div className="text-lg font-bold text-primary">{today.viewed}</div><div className="text-xs text-gray-500">viewed</div></div>
              <div className="text-center"><div className="text-lg font-bold text-green-600">{today.liked}</div><div className="text-xs text-gray-500">liked</div></div>
              <div className="text-center"><div className="text-lg font-bold text-blue-600">{today.applied}</div><div className="text-xs text-gray-500">applied</div></div>
            </CardContent>
          </Card>
        )}

        {/* Awaiting outcome — the calibration data flywheel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active applications</CardTitle>
            <p className="text-sm text-gray-500">
              When you hear back, log the outcome — your data trains the match scoring model.
            </p>
          </CardHeader>
          <CardContent>
            {appsLoading && <div className="text-sm text-gray-500 py-4">Loading...</div>}
            {!appsLoading && openApps.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No active applications.</p>
                <p className="text-xs mt-1">Apply to jobs from the swipe page to start tracking.</p>
              </div>
            )}
            <div className="space-y-3">
              {openApps.map((app: any) => (
                <div key={app.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate">{app.title}</div>
                      <div className="text-sm text-gray-500 truncate">
                        {app.company}{app.location ? ` · ${app.location}` : ''}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Applied {new Date(app.applied_at).toLocaleDateString()}
                      </div>
                    </div>
                    {app.external_url && (
                      <a
                        href={app.external_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-0.5 shrink-0"
                      >
                        view <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                    {OUTCOME_BUTTONS.map(b => (
                      <Button
                        key={b.value}
                        size="sm"
                        variant="outline"
                        className={`h-8 text-xs ${b.cls}`}
                        onClick={() => setOutcome.mutate({ id: app.id, outcome: b.value })}
                        disabled={setOutcome.isPending}
                      >
                        <b.icon className="w-3 h-3 mr-1" />
                        {b.label}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {closedApps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {closedApps.map((app: any) => (
                  <div key={app.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 truncate text-sm">{app.title}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {app.company} · {new Date(app.applied_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge className={`${STATUS_COLOR[app.status] ?? 'bg-gray-100 text-gray-800'} border-0 capitalize shrink-0`}>
                      {app.status === 'interview' && <CheckCircle className="w-3 h-3 mr-1" />}
                      {app.status.replace('_', ' ')}
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

import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Onboarding from "@/pages/onboarding";
import Jobs from "@/pages/jobs";
import Liked from "@/pages/liked";
import JobDetailPage from "@/pages/job-detail";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import AdminPage from "@/pages/admin";
import RecruiterDashboard from "@/pages/recruiter-dashboard";
import RecruiterJobPost from "@/pages/recruiter-job-post";
import RecruiterCandidates from "@/pages/recruiter-candidates";
import { SwipeHireLogo } from "@/components/SwipeHireLogo";
import { SplashScreen } from "@/components/SplashScreen";
import { useUserRole } from "@/hooks/useUserRole";

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { data: authResponse, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
        <div className="text-center">
          <div className="mb-4">
            <SwipeHireLogo size="xl" className="justify-center mb-2" />
            <p className="text-brand-gray">Visa-aware job platform</p>
          </div>
          <div className="animate-pulse text-lg text-primary">Loading...</div>
        </div>
      </div>
    );
  }

  if (!authResponse?.user) {
    return <Login />;
  }

  const user = authResponse.user;

  // Onboarding gating: respect explicit isProfileComplete flag set by Onboarding's
  // "Skip setup" / "Finish" buttons. A user who skips is shown the swipe page
  // immediately — they can fill profile fields later from /profile.
  const profileMarkedComplete = !!user.isProfileComplete;
  const hasMinimumProfile = !!user.targetJobTitle;
  const needsOnboarding = !profileMarkedComplete && !hasMinimumProfile;

  if (needsOnboarding && window.location.pathname !== '/onboarding') {
    return <Onboarding />;
  }

  return <>{children}</>;
}

function RecruiterRoute({ children }: { children: React.ReactNode }) {
  const { hasRecruiterAccess, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-secondary/5">
        <div className="text-center">
          <div className="animate-pulse text-lg text-primary">Checking permissions...</div>
        </div>
      </div>
    );
  }

  if (!hasRecruiterAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">
            You need recruiter permissions to access this area. Contact your administrator if you believe this is an error.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            Return to Jobs
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(true);

  // Check if this is the first visit to the app
  useEffect(() => {
    const hasSeenSplash = sessionStorage.getItem('hasSeenSplash');
    if (hasSeenSplash) {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    sessionStorage.setItem('hasSeenSplash', 'true');
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/onboarding" component={Onboarding} />
      <Route path="/">
        <AuthWrapper>
          <Jobs />
        </AuthWrapper>
      </Route>
      <Route path="/liked">
        <AuthWrapper>
          <Liked />
        </AuthWrapper>
      </Route>
      <Route path="/jobs/:id">
        <AuthWrapper>
          <JobDetailPage />
        </AuthWrapper>
      </Route>
      <Route path="/dashboard">
        <AuthWrapper>
          <Dashboard />
        </AuthWrapper>
      </Route>
      <Route path="/profile">
        <AuthWrapper>
          <Profile />
        </AuthWrapper>
      </Route>
      <Route path="/admin">
        <AuthWrapper>
          <AdminPage />
        </AuthWrapper>
      </Route>
      <Route path="/recruiter/dashboard">
        <AuthWrapper>
          <RecruiterRoute>
            <RecruiterDashboard />
          </RecruiterRoute>
        </AuthWrapper>
      </Route>
      <Route path="/recruiter/jobs/new">
        <AuthWrapper>
          <RecruiterRoute>
            <RecruiterJobPost />
          </RecruiterRoute>
        </AuthWrapper>
      </Route>
      <Route path="/recruiter/candidates">
        <AuthWrapper>
          <RecruiterRoute>
            <RecruiterCandidates />
          </RecruiterRoute>
        </AuthWrapper>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

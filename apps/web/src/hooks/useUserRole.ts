import { useQuery } from '@tanstack/react-query';
import { getQueryFn } from '@/lib/queryClient';

export function useUserRole() {
  const { data: authResponse, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const user = authResponse?.user;
  const userType = user?.userType || 'candidate';

  return {
    user,
    userType,
    isLoading,
    isRecruiter: userType === 'recruiter',
    isAdmin: userType === 'admin',
    isCandidate: userType === 'candidate',
    hasRecruiterAccess: userType === 'recruiter' || userType === 'admin',
  };
}
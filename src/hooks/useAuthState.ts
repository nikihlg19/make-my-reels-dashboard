import { useUser } from '@clerk/react';

export interface AuthState {
  user: ReturnType<typeof useUser>['user'];
  userEmail: string | undefined;
  isAdmin: boolean;
  currentUserName: string;
  currentUserEmail: string;
}

export const useAuthState = (): AuthState => {
  const { user } = useUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress;
  const adminEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(',').map((e: string) => e.trim().toLowerCase()) || [];
  const isAdmin = (user?.publicMetadata as any)?.role === 'admin' || adminEmails.includes(userEmail?.toLowerCase() || '');
  const currentUserName = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || 'Unknown';
  const currentUserEmail = user?.primaryEmailAddress?.emailAddress || '';

  return { user, userEmail, isAdmin, currentUserName, currentUserEmail };
};

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';

interface StudioRouteGuardProps {
  children: ReactNode;
}

export function StudioRouteGuard({ children }: StudioRouteGuardProps) {
  const { session, isInitialized } = useAuth();
  const location = useLocation();

  if (!isInitialized) {
    return (
      <div
        className="zibi-container"
        style={{ paddingBlock: 'var(--space-12)' }}
        role="status"
      >
        <LoadingIndicator />
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/"
        replace
        state={{
          authRequired: true,
          from: `${location.pathname}${location.search}${location.hash}`,
        }}
      />
    );
  }

  return <>{children}</>;
}

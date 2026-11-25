import { lazy, Suspense } from 'react';
import { createBrowserRouter, useParams } from 'react-router-dom';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import { DiscoveryPage } from '@/features/discovery/pages/DiscoveryPage';
import { PublicLayout } from '@/layouts/PublicLayout';
import { StudioLayout } from '@/layouts/StudioLayout';
import { StudioRouteGuard } from '@/app/guards/StudioRouteGuard';

const StorefrontPage = lazy(() =>
  import('@/features/storefront/pages/StorefrontPage').then((m) => ({
    default: m.StorefrontPage,
  })),
);

const StudioDashboardPage = lazy(() =>
  import('@/features/studio/pages/StudioDashboardPage').then((m) => ({
    default: m.StudioDashboardPage,
  })),
);

const StudioPlaceholderPage = lazy(() =>
  import('@/features/studio/pages/StudioPlaceholderPage').then((m) => ({
    default: m.StudioPlaceholderPage,
  })),
);

const SplitInvitationPage = lazy(() =>
  import('@/features/invitations/pages/SplitInvitationPage').then((m) => ({
    default: m.SplitInvitationPage,
  })),
);

const NotFoundPage = lazy(() =>
  import('@/layouts/NotFoundPage').then((m) => ({
    default: m.NotFoundPage,
  })),
);

function RouteSuspense({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="zibi-container" style={{ paddingBlock: 'var(--space-12)' }}>
          <LoadingIndicator />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

/**
 * React Router v6/v7 treats dynamic segments as full path segments (/:handle).
 * This guard routes /@{handle} to StorefrontPage and unknown paths to NotFoundPage.
 */
function HandleOrNotFound() {
  const { handle } = useParams<{ handle: string }>();
  if (handle && handle.startsWith('@') && handle.length > 1) {
    return (
      <RouteSuspense>
        <StorefrontPage />
      </RouteSuspense>
    );
  }
  return (
    <RouteSuspense>
      <NotFoundPage />
    </RouteSuspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: <DiscoveryPage />,
      },
      {
        path: 'invites/:inviteId',
        element: (
          <RouteSuspense>
            <SplitInvitationPage />
          </RouteSuspense>
        ),
      },
      {
        path: ':handle',
        element: <HandleOrNotFound />,
      },
      {
        path: '*',
        element: (
          <RouteSuspense>
            <NotFoundPage />
          </RouteSuspense>
        ),
      },
    ],
  },
  {
    path: '/studio',
    element: (
      <StudioRouteGuard>
        <StudioLayout />
      </StudioRouteGuard>
    ),
    children: [
      {
        index: true,
        element: (
          <RouteSuspense>
            <StudioDashboardPage />
          </RouteSuspense>
        ),
      },
      {
        path: 'storefront',
        element: (
          <RouteSuspense>
            <StudioPlaceholderPage section="storefront" />
          </RouteSuspense>
        ),
      },
      {
        path: 'products',
        element: (
          <RouteSuspense>
            <StudioPlaceholderPage section="products" />
          </RouteSuspense>
        ),
      },
      {
        path: 'collaborations',
        element: (
          <RouteSuspense>
            <StudioPlaceholderPage section="collaborations" />
          </RouteSuspense>
        ),
      },
      {
        path: '*',
        element: (
          <RouteSuspense>
            <NotFoundPage />
          </RouteSuspense>
        ),
      },
    ],
  },
]);

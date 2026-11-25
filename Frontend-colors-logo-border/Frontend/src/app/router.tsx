import { lazy, Suspense } from 'react';
import { createBrowserRouter, useParams } from 'react-router-dom';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import { DiscoveryPage } from '@/features/discovery/pages/DiscoveryPage';
import { PublicLayout } from '@/layouts/PublicLayout';
import { StudioLayout } from '@/layouts/StudioLayout';
import { SignInPage } from '@/features/authentication/components/SignInPage';
import { StudioRouteGuard } from '@/app/guards/StudioRouteGuard';

const CuratedArtistPage = lazy(() =>
  import('@/features/discovery/pages/CuratedArtistPage').then((m) => ({ default: m.CuratedArtistPage })),
);

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

const StudioStorefrontPage = lazy(() =>
  import('@/features/studio/pages/StudioStorefrontPage').then((m) => ({ default: m.StudioStorefrontPage })),
);

const StudioProductsPage = lazy(() =>
  import('@/features/studio/pages/StudioProductsPage').then((m) => ({ default: m.StudioProductsPage })),
);

const StudioCollaborationsPage = lazy(() =>
  import('@/features/studio/pages/StudioCollaborationsPage').then((m) => ({ default: m.StudioCollaborationsPage })),
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
        <StorefrontPage key={handle} />
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
        path: 'login',
        element: <SignInPage key="login" />,
      },
      {
        path: 'create-account',
        element: <SignInPage key="create-account" createAccount />,
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
        path: 'artists/:slug',
        element: <RouteSuspense><CuratedArtistPage /></RouteSuspense>,
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
            <StudioStorefrontPage />
          </RouteSuspense>
        ),
      },
      {
        path: 'products',
        element: (
          <RouteSuspense>
            <StudioProductsPage />
          </RouteSuspense>
        ),
      },
      {
        path: 'collaborations',
        element: (
          <RouteSuspense>
            <StudioCollaborationsPage />
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

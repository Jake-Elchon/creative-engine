import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '@/app/providers/AuthProvider';
import { StudioRouteGuard } from '@/app/guards/StudioRouteGuard';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ToastProvider } from '@/app/providers/ToastProvider';

const authenticatedSession = {
  accessToken: 'access_token',
  refreshToken: 'refresh_token',
  user: {
    id: 'creator-1',
    email: 'creator@example.com',
    fullName: 'Zibi Creator',
    preferredLang: 'en' as const,
    registeredAt: '2026-01-01T00:00:00.000Z',
    phone: '+237677000000',
  },
  home: {
    status: 'ready' as const,
    artists: [],
    nextCursor: null,
  },
};

function SessionSeeder({ authenticated }: { authenticated: boolean }) {
  const { setSession } = useAuth();

  useEffect(() => {
    setSession(authenticated ? authenticatedSession : null);
  }, [authenticated, setSession]);

  return null;
}

function LogoutControl() {
  const { signOut } = useAuth();
  return <button onClick={signOut}>Log out</button>;
}

function TestRoutes({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  const navigate = useNavigate();

  return (
    <>
      <SessionSeeder authenticated={authenticated} />
      <button onClick={() => navigate('/invites/test-invite#token=test-token')}>
        Visit public invite
      </button>
      <Routes>
        <Route path="/" element={<div>Public page</div>} />
        <Route path="/login" element={<LoginDestination />} />
        <Route
          path="/studio"
          element={
            <StudioRouteGuard>
              <div>
                Studio page
                <LogoutControl />
              </div>
            </StudioRouteGuard>
          }
        />
        <Route
          path="/invites/:inviteId"
          element={<div>Public invitation page</div>}
        />
        <Route path="/@:handle" element={<div>Public storefront</div>} />
      </Routes>
    </>
  );
}

function LoginDestination() {
  const { state } = useLocation();
  return <div>Login route <span>{state?.from}</span></div>;
}

function renderGuard(initialEntry: string, authenticated = false) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LanguageProvider>
        <ToastProvider>
          <AuthProvider>
            <TestRoutes authenticated={authenticated} />
          </AuthProvider>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('StudioRouteGuard', () => {
  it('redirects unauthenticated access to login with the original destination', async () => {
    renderGuard('/studio?view=recent#overview');
    expect(await screen.findByText('Login route')).toBeInTheDocument();
    expect(screen.getByText('/studio?view=recent#overview')).toBeInTheDocument();
  });

  it('allows authenticated access to Studio', async () => {
    renderGuard('/studio', true);
    expect(await screen.findByText('Studio page')).toBeInTheDocument();
  });

  it('logout removes Studio access', async () => {
    const user = userEvent.setup();
    renderGuard('/studio', true);

    await screen.findByText('Studio page');
    await user.click(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Login route')).toBeInTheDocument();
  });

  it('leaves public invitation and storefront routes accessible', async () => {
    const user = userEvent.setup();
    renderGuard('/invites/test-invite#token=test-token');

    expect(await screen.findByText('Public invitation page')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Visit public invite' }));

    render(
      <MemoryRouter initialEntries={['/@amina-njong']}>
        <LanguageProvider>
          <ToastProvider>
            <AuthProvider>
              <Routes>
                <Route path="/:handle" element={<div>Public storefront</div>} />
              </Routes>
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Public storefront')).toBeInTheDocument();
  });

  it('resolves authentication initialization', () => {
    const { getByText } = render(
      <AuthProvider>
        <AuthInitializationProbe />
      </AuthProvider>,
    );

    expect(getByText(/initialized:/)).toBeInTheDocument();
  });
});

function AuthInitializationProbe() {
  const { isInitialized } = useAuth();
  return <div>initialized: {String(isInitialized)}</div>;
}

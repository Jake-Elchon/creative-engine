import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { BorderStrip } from '@/components/brand/BorderStrip';
import { Footer } from '@/components/navigation/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { OtpModal } from '@/features/authentication/components/OtpModal';

export function PublicLayout() {
  const { openAuthModal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = location.state as
    | { authRequired?: boolean; from?: string }
    | null;

  useEffect(() => {
    if (routeState?.authRequired) {
      openAuthModal();
    }
  }, [openAuthModal, routeState?.authRequired]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <BorderStrip />
      <main style={{ flex: 1 }} className="zibi-view-enter">
        <Outlet />
      </main>
      <Footer />
      <OtpModal
        onSuccess={
          routeState?.authRequired && routeState.from
            ? () => navigate(routeState.from as string, { replace: true })
            : undefined
        }
      />
    </div>
  );
}

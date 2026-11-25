import { Outlet, useLocation } from 'react-router-dom';
import { BorderStrip } from '@/components/brand/BorderStrip';
import { Footer } from '@/components/navigation/Footer';
import { Navbar } from '@/components/navigation/Navbar';
import { OtpModal } from '@/features/authentication/components/OtpModal';

export function PublicLayout() {
  const { pathname } = useLocation();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <BorderStrip />
      <main style={{ flex: 1 }} className="zibi-view-enter">
        <Outlet />
      </main>
      <Footer />
      {pathname !== '/login' && pathname !== '/create-account' && <OtpModal />}
    </div>
  );
}

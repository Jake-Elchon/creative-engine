import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { OtpModal } from '@/features/authentication/components/OtpModal';
import { StudioSidebar } from '@/features/studio/components/StudioSidebar';
import { StudioHeader } from '@/features/studio/components/StudioHeader';
import '@/features/studio/Studio.css';

export function StudioLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { session, signOut } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label={t.studio.workspaceLabel}>
        <StudioSidebar />
      </aside>

      <div className="studio-main">
        <StudioHeader
          onOpenMenu={() => setDrawerOpen(true)}
          creatorName={session?.user.fullName}
          onSignOut={signOut}
        />
        <main className="studio-workspace zibi-view-enter" id="studio-main-content">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <div
          className="studio-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDrawerOpen(false);
          }}
        >
          <aside
            className="studio-drawer"
            id="studio-mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={t.studio.workspaceLabel}
          >
            <div className="studio-drawer__top">
              <span className="studio-drawer__title">{t.studio.workspaceLabel}</span>
              <button
                type="button"
                className="studio-icon-button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t.studio.closeNavigation}
              >
                <X size={20} />
              </button>
            </div>
            <StudioSidebar
              creatorName={session?.user.fullName}
              onSignOut={signOut}
              inDrawer
            />
          </aside>
        </div>
      )}
      <OtpModal />
    </div>
  );
}

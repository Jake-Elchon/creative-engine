import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '@/hooks/useDialogFocus';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { StudioSidebar } from '@/features/studio/components/StudioSidebar';
import { StudioHeader } from '@/features/studio/components/StudioHeader';
import '@/features/studio/Studio.css';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary, CreatedProduct } from '@/types/models';
import type { StudioWorkspace } from '@/features/studio/workspace';

export function StudioLayout() {
  const { session, signOut } = useAuth();
  return <StudioWorkspaceLayout key={session?.user.id} accountId={session?.user.id}
    creatorName={session?.user.fullName} signOut={signOut} />;
}

function StudioWorkspaceLayout({ accountId, creatorName, signOut }: {
  accountId?: string;
  creatorName?: string;
  signOut: () => void;
}) {
  const storageKey = accountId ? `zibi:studio:storefront:${accountId}` : null;
  const [rememberedHandle] = useState(() => {
    try { return storageKey ? window.localStorage.getItem(storageKey) : null; }
    catch { return null; }
  });
  const [drawerLocation, setDrawerLocation] = useState<string | null>(null);
  const [storefront, updateStorefront] = useState<ArtistSummary | null>(null);
  const [isRestoringStorefront, setRestoringStorefront] = useState(Boolean(rememberedHandle));
  const [products, setProducts] = useState<CreatedProduct[]>([]);
  const restoration = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!rememberedHandle) return;
    const controller = new AbortController();
    restoration.current = controller;
    void apiClient.getPublicStorefront({ handle: rememberedHandle, limit: 1, noStore: true, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) updateStorefront(result.storefront);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !storageKey || !(error instanceof ApiClientError) || error.status !== 404) return;
        try { window.localStorage.removeItem(storageKey); } catch { /* Storage is optional. */ }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRestoringStorefront(false);
      });
    return () => controller.abort();
  }, [rememberedHandle, storageKey]);

  const workspace: StudioWorkspace = {
    storefront, isRestoringStorefront, products,
    setStorefront: (selection) => {
      restoration.current?.abort();
      setRestoringStorefront(false);
      updateStorefront(selection);
      if (!storageKey) return;
      try {
        if (selection) window.localStorage.setItem(storageKey, selection.handle);
        else window.localStorage.removeItem(storageKey);
      } catch { /* Storage is optional. */ }
    },
    updateProfileImage: (profile) => updateStorefront((current) => current?.storefrontId === profile.storefrontId
      ? { ...current, profileImageUrl: profile.profileImageUrl } : current),
    recordProduct: (product) => setProducts((current) => [product, ...current]),
  };
  const { t } = useLanguage();
  const location = useLocation();

  const drawerOpen = drawerLocation === location.key;
  const closeDrawer = () => setDrawerLocation(null);
  const drawer = useDialogFocus<HTMLElement>(drawerOpen, closeDrawer);

  return (
    <div className="studio-shell">
      <aside className="studio-sidebar" aria-label={t.studio.workspaceLabel}>
        <StudioSidebar />
      </aside>

      <div className="studio-main">
        <StudioHeader
          onOpenMenu={() => setDrawerLocation(location.key)}
          menuOpen={drawerOpen}
          creatorName={creatorName}
          onSignOut={signOut}
        />
        <main className="studio-workspace zibi-view-enter" id="studio-main-content">
          <Outlet context={workspace} />
        </main>
      </div>

      {drawerOpen && createPortal(
        <div
          className="studio-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside
            ref={drawer}
            tabIndex={-1}
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
                data-dialog-initial
                className="studio-icon-button"
                onClick={() => closeDrawer()}
                aria-label={t.studio.closeNavigation}
              >
                <X size={20} />
              </button>
            </div>
            <StudioSidebar
              creatorName={creatorName}
              onSignOut={signOut}
              inDrawer
            />
          </aside>
        </div>,
        document.body,
      )}
    </div>
  );
}

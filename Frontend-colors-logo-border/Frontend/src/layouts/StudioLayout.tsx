import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { ArtistSummary, StudioInventory } from '@/types/models';
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
  const [preferredHandle, setPreferredHandle] = useState(() => {
    try { return storageKey ? window.localStorage.getItem(storageKey) : null; }
    catch { return null; }
  });
  const [drawerLocation, setDrawerLocation] = useState<string | null>(null);
  const [inventory, setInventory] = useState<StudioInventory>();
  const [inventoryError, setInventoryError] = useState<unknown>(null);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const storefronts = inventory?.storefronts ?? [];
  const storefront = storefronts.find((item) => item.handle === preferredHandle) ?? storefronts[0] ?? null;

  const loadInventory = useCallback(async (cursor?: string) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const page = await apiClient.getStudioInventory({ cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      setInventory((current) => cursor && current ? {
        ...page,
        storefronts: [...new Map([...page.storefronts, ...current.storefronts].map((item) => [item.storefrontId, item])).values()],
        products: [...current.products, ...page.products.filter((product) =>
          !current.products.some((item) => item.productId === product.productId),
        )],
      } : page);
    } catch (error) {
      if (!controller.signal.aborted) setInventoryError(error);
    } finally {
      if (request.current === controller) {
        request.current = null;
        setInventoryLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadInventory();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [loadInventory]);

  function setStorefront(selection: ArtistSummary) {
    setPreferredHandle(selection.handle);
    setInventory((current) => current ? {
      ...current,
      storefronts: [...new Map([...current.storefronts, selection].map((item) => [item.storefrontId, item])).values()],
    } : current);
    if (storageKey) {
      try { window.localStorage.setItem(storageKey, selection.handle); } catch { /* Storage is optional. */ }
    }
  }

  const workspace: StudioWorkspace = {
    storefront, setStorefront, storefronts, inventory, inventoryError, inventoryLoading, loadInventory,
    recordProduct: (product) => setInventory((current) => current ? {
      ...current, products: [product, ...current.products.filter((item) => item.productId !== product.productId)],
    } : current),
    recordPrices: ({ productId, prices }) => setInventory((current) => current ? {
      ...current, products: current.products.map((product) => product.productId === productId ? { ...product, prices } : product),
    } : current),
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

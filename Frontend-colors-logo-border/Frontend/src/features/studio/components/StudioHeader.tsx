import { Menu, LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';

interface StudioHeaderProps {
  creatorName?: string;
  onOpenMenu: () => void;
  menuOpen: boolean;
  onSignOut: () => void;
}

export function StudioHeader({
  creatorName,
  onOpenMenu,
  menuOpen,
  onSignOut,
}: StudioHeaderProps) {
  const { t } = useLanguage();
  const location = useLocation();

  const pageTitle =
    location.pathname === '/studio/storefront'
      ? t.studio.storefrontTitle
      : location.pathname === '/studio/products'
        ? t.studio.productsTitle
        : location.pathname === '/studio/collaborations'
          ? t.studio.collaborationsTitle
          : t.studio.overviewTitle;

  return (
    <header className="studio-header">
      <div className="studio-header__title">
        <button
          type="button"
          className="studio-mobile-menu"
          onClick={onOpenMenu}
          aria-label={t.studio.openNavigation}
          aria-controls="studio-mobile-navigation"
          aria-expanded={menuOpen}
        >
          <Menu size={21} />
        </button>
        <div>
          <span className="studio-header__eyebrow">{t.studio.workspaceLabel}</span>
          <h1>{pageTitle}</h1>
        </div>
      </div>

      <div className="studio-account" aria-label={t.studio.accountLabel}>
        {creatorName && (
          <div className="studio-account__identity">
            <span className="studio-account__avatar" aria-hidden="true">
              {creatorName.charAt(0).toUpperCase()}
            </span>
            <span className="studio-account__name">{creatorName}</span>
          </div>
        )}
        <button type="button" className="studio-logout" aria-label={t.nav.signOut} onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          <span>{t.nav.signOut}</span>
        </button>
      </div>
    </header>
  );
}

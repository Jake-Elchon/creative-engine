import {
  ArrowLeft,
  LayoutDashboard,
  Package,
  Store,
  Users,
  LogOut,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { ZibiMark } from '@/components/brand/ZibiLogo';

interface StudioSidebarProps {
  creatorName?: string;
  onSignOut?: () => void;
  inDrawer?: boolean;
}

export function StudioSidebar({
  creatorName,
  onSignOut,
  inDrawer = false,
}: StudioSidebarProps) {
  const { t } = useLanguage();

  const items = [
    { to: '/studio', label: t.studio.overview, icon: LayoutDashboard, end: true },
    { to: '/studio/storefront', label: t.studio.storefrontNav, icon: Store, end: false },
    { to: '/studio/products', label: t.studio.productsNav, icon: Package, end: false },
    { to: '/studio/collaborations', label: t.studio.collaborationsNav, icon: Users, end: false },
  ];

  return (
    <div className="studio-sidebar__content">
      <div className="studio-brand">
        <ZibiMark size={44} decorative />
        <div>
          <strong>{t.common.brandName}</strong>
          <span>{t.studio.workspaceLabel}</span>
        </div>
      </div>

      <nav className="studio-nav" aria-label={t.studio.workspaceLabel}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `studio-nav__item ${isActive ? 'studio-nav__item--active' : ''}`
            }
          >
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="studio-sidebar__bottom">
        <NavLink to="/" className="studio-nav__item studio-nav__item--public">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>{t.studio.backToExplore}</span>
        </NavLink>
        {inDrawer && creatorName && onSignOut && (
          <button type="button" className="studio-logout" onClick={onSignOut}>
            <LogOut size={16} aria-hidden="true" />
            <span>{t.nav.signOut}</span>
          </button>
        )}
      </div>
    </div>
  );
}

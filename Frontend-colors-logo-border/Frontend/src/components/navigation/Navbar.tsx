import { useState } from 'react';
import { Globe, LogOut, Menu, User, X } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { ZibiLogo } from '@/components/brand/ZibiLogo';
import { apiClient } from '@/services/api';
import './Navbar.css';

export function Navbar() {
  const { locale, toggleLocale, t } = useLanguage();
  const { session, openAuthModal, signOut } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <>
      {apiClient.isMock && (
        <div className="zibi-demo-banner" role="status">
          {t.common.demoModeBanner}
        </div>
      )}

      <header className="zibi-navbar">
        <div className="zibi-container zibi-navbar__inner">
          <Link to="/" className="zibi-brand" onClick={closeDrawer}>
            <ZibiLogo />
          </Link>

          <nav className="zibi-nav-desktop" aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `zibi-nav-link ${isActive ? 'zibi-nav-link--active' : ''}`
              }
            >
              {t.nav.explore}
            </NavLink>
            <NavLink
              to="/studio"
              className={({ isActive }) =>
                `zibi-nav-link ${isActive ? 'zibi-nav-link--active' : ''}`
              }
            >
              {t.nav.studio}
            </NavLink>
          </nav>

          <div className="zibi-nav-actions">
            <button
              type="button"
              className="zibi-lang-toggle"
              onClick={toggleLocale}
              aria-label={`${t.nav.language}: ${locale.toUpperCase()}`}
            >
              <Globe size={14} />
              <span>{locale.toUpperCase()}</span>
            </button>

            {session ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={signOut}
                leftIcon={<LogOut size={14} />}
              >
                {session.user.fullName.split(' ')[0]} · {t.nav.signOut}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={openAuthModal}
                leftIcon={<User size={14} />}
              >
                {t.nav.signIn}
              </Button>
            )}
          </div>

          <button
            type="button"
            className="zibi-mobile-toggle"
            onClick={() => setDrawerOpen(true)}
            aria-label={t.nav.openMenu}
            aria-expanded={drawerOpen}
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {drawerOpen && (
        <div
          className="zibi-drawer-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDrawer();
          }}
        >
          <aside className="zibi-drawer zibi-view-enter" aria-label="Mobile menu">
            <div className="zibi-drawer__top">
              <ZibiLogo markSize={36} />
              <button
                type="button"
                className="zibi-mobile-toggle"
                onClick={closeDrawer}
                aria-label={t.nav.closeMenu}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="zibi-drawer__links">
              <NavLink
                to="/"
                end
                onClick={closeDrawer}
                className={({ isActive }) =>
                  `zibi-drawer__link ${isActive ? 'zibi-drawer__link--active' : ''}`
                }
              >
                {t.nav.explore}
              </NavLink>
              <NavLink
                to="/studio"
                onClick={closeDrawer}
                className={({ isActive }) =>
                  `zibi-drawer__link ${isActive ? 'zibi-drawer__link--active' : ''}`
                }
              >
                {t.nav.studio}
              </NavLink>
            </nav>

            <hr className="cultural-divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button
                type="button"
                className="zibi-lang-toggle"
                onClick={toggleLocale}
                style={{ justifyContent: 'center' }}
              >
                <Globe size={14} />
                <span>
                  {t.nav.language}: {locale === 'en' ? 'English' : 'Français'}
                </span>
              </button>

              {session ? (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => {
                    signOut();
                    closeDrawer();
                  }}
                  leftIcon={<LogOut size={16} />}
                >
                  {t.nav.signOut}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    closeDrawer();
                    openAuthModal();
                  }}
                  leftIcon={<User size={16} />}
                >
                  {t.nav.signIn}
                </Button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

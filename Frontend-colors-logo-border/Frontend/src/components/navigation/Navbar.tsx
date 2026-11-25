import { useState } from 'react';
import { Globe, LogOut, Menu, User, X } from 'lucide-react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Button } from '@/components/ui/Button/Button';
import { ZibiLogo } from '@/components/brand/ZibiLogo';
import { apiClient } from '@/services/api';
import './Navbar.css';

export function Navbar() {
  const { locale, toggleLocale, t } = useLanguage();
  const { session, signOut } = useAuth();
  const location = useLocation();
  const authState = location.pathname === '/login' || location.pathname === '/create-account' ? location.state : undefined;
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
              <>
                <Link to="/login" state={authState} className="zibi-btn zibi-btn--primary zibi-btn--sm">
                  <User size={14} aria-hidden="true" />
                  {t.nav.signIn}
                </Link>
                <Link to="/create-account" state={authState} className="zibi-btn zibi-btn--secondary zibi-btn--sm">
                  {t.auth.registerSubmit}
                </Link>
              </>
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
                <>
                  <Link to="/login" state={authState} onClick={closeDrawer} className="zibi-btn zibi-btn--primary zibi-btn--md zibi-btn--full">
                    <User size={16} aria-hidden="true" />
                    {t.nav.signIn}
                  </Link>
                  <Link to="/create-account" state={authState} onClick={closeDrawer} className="zibi-btn zibi-btn--secondary zibi-btn--md zibi-btn--full">
                    {t.auth.registerSubmit}
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

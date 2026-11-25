import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Card } from '@/components/ui/Card/Card';
import { useOtpAuth } from '../hooks/useOtpAuth';
import { OtpForm } from './OtpForm';

function studioDestination(state: unknown) {
  const from = state && typeof state === 'object' && 'from' in state ? state.from : null;
  if (typeof from !== 'string' || !/^\/studio(?:[/?#]|$)/.test(from)) return '/';
  const target = new URL(from, window.location.origin);
  return target.origin === window.location.origin && /^\/studio(?:\/|$)/.test(target.pathname)
    ? `${target.pathname}${target.search}${target.hash}`
    : '/';
}

export function SignInPage({ createAccount = false }: { createAccount?: boolean }) {
  const { session, closeAuthModal } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const auth = useOtpAuth();

  useEffect(() => { closeAuthModal(); }, [closeAuthModal]);

  if (session) return <Navigate to={studioDestination(location.state)} replace />;

  const action = auth.challenge?.nextAction;
  const title = createAccount
    ? (action === 'login' ? t.auth.loginTitle : t.auth.registerTitle)
    : t.auth.modalTitle;

  return (
    <section className="zibi-container zibi-sign-in" aria-labelledby="zibi-sign-in-heading">
      <h1 id="zibi-sign-in-heading">{title}</h1>
      <Card>
        <OtpForm auth={auth} showChallengeTitle={!createAccount} requestLabel={createAccount ? t.auth.getCode : undefined} />
        {!action && (
          <p className="zibi-sign-in-switch">
            {createAccount ? t.auth.haveAccount : t.auth.newAccount}{' '}
            <Link to={createAccount ? '/login' : '/create-account'} state={location.state}>
              {createAccount ? t.auth.loginTitle : t.auth.registerSubmit}
            </Link>
          </p>
        )}
      </Card>
    </section>
  );
}

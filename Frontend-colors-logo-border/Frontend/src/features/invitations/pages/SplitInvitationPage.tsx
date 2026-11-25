import { useEffect, useRef, useState } from 'react';
import { Check, FileSignature, X } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { SplitDecision, SplitInvitationDetail } from '@/types/models';
import { extractInviteTokenFromHash } from '@/utils/url';
import { formatBpsAsPercent } from '@/utils/validation';
import { useCollaboratorIdentity } from '../collaboratorIdentity';

type LandingState =
  | { kind: 'loading' | 'expired' | 'missing' | 'error' }
  | { kind: 'ready'; data: SplitInvitationDetail };

export function SplitInvitationPage() {
  const { inviteId = '' } = useParams<{ inviteId: string }>();
  const { hash } = useLocation();
  const inviteToken = extractInviteTokenFromHash(hash);

  return <InvitationLanding key={inviteId} inviteId={inviteId} inviteToken={inviteToken} />;
}

function InvitationLanding({ inviteId, inviteToken }: { inviteId: string; inviteToken: string | null }) {
  const { t } = useLanguage();
  const identity = useCollaboratorIdentity();
  const [landing, setLanding] = useState<LandingState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState<SplitDecision | null>(null);
  const [decisionError, setDecisionError] = useState('');
  const active = useRef(false);
  const load = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!inviteToken || !inviteId) return;
    const controller = new AbortController();
    load.current = controller;
    setLanding({ kind: 'loading' });
    setDecisionError('');
    void apiClient.getSplitInvitation(inviteId, inviteToken, controller.signal).then((data) => {
      if (!controller.signal.aborted) setLanding({ kind: 'ready', data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiClientError ? error.status : null;
      setLanding({ kind: status === 410 ? 'expired' : status === 404 ? 'missing' : 'error' });
    });
    return () => controller.abort();
  }, [attempt, inviteId, inviteToken]);

  const copy = t.invites;
  const retry = () => setAttempt((previous) => previous + 1);
  const verified = identity.status === 'verified' && identity.session.phoneConfirmed && Boolean(identity.session.accessToken);

  async function submit(value: SplitDecision) {
    if (active.current || !inviteToken || !verified || identity.status !== 'verified' ||
        landing.kind !== 'ready' || landing.data.status !== 'PENDING') return;
    const controller = load.current;
    if (!controller || controller.signal.aborted) return;
    active.current = true;
    setDecision(value);
    setDecisionError('');
    try {
      const data = await apiClient.respondToSplitInvitation(inviteId, inviteToken, value, identity.session);
      if (!controller.signal.aborted) setLanding({ kind: 'ready', data });
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiClientError ? error.status : null;
      switch (status) {
        case 401: setDecisionError(copy.signInRequired); break;
        case 403: setDecisionError(copy.phoneRequired); break;
        case 404: setLanding({ kind: 'missing' }); break;
        case 409: setDecisionError(copy.decisionConflict); break;
        case 410: setLanding({ kind: 'expired' }); break;
        default: setDecisionError(copy.decisionFailed);
      }
    } finally {
      active.current = false;
      setDecision(null);
    }
  }

  const information = identity.status === 'unavailable' ? copy.verificationUnavailable
    : identity.status === 'signedOut' ? copy.signInRequired
    : identity.status === 'phoneRequired' ? copy.phoneRequired : null;

  return (
    <section className="zibi-container" style={{ paddingBlock: 'var(--space-12)', maxWidth: 640 }}>
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)' }}>{copy.title}</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>{copy.subtitle}</p>
      </div>

      {!inviteToken ? <EmptyState title={copy.missingTokenTitle} subtitle={copy.missingTokenBody} icon={<FileSignature size={24} />} />
        : landing.kind === 'loading' ? <Card><LoadingIndicator /></Card>
        : landing.kind === 'expired' ? <EmptyState title={copy.expiredNote} icon={<FileSignature size={24} />} />
        : landing.kind === 'missing' ? <EmptyState title={copy.notFound} icon={<FileSignature size={24} />} />
        : landing.kind === 'error' ? <ErrorState title={copy.loadFailed} onRetry={retry} />
        : landing.kind === 'ready' && (
          <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{copy.statusLabel}</span>
              <Badge variant={landing.data.status === 'ACCEPTED' ? 'forest' : landing.data.status === 'REJECTED' ? 'terracotta' : 'gold'}>
                {landing.data.status === 'ACCEPTED' ? copy.accepted : landing.data.status === 'REJECTED' ? copy.rejected : copy.pending}
              </Badge>
            </div>
            <hr className="cultural-divider" />
            <dl>
              <dt style={{ color: 'var(--text-muted)' }}>{copy.productId}</dt>
              <dd><code style={{ overflowWrap: 'anywhere' }}>{landing.data.productId}</code></dd>
              <dt style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)' }}>{copy.shareLabel}</dt>
              <dd style={{ color: 'var(--color-gold)', fontSize: 'var(--text-xl)' }}>{formatBpsAsPercent(landing.data.shareBps)}</dd>
            </dl>
            {landing.data.status === 'PENDING' && (
              <>
                {information && <p role="status">{information}</p>}
                {identity.status === 'signedOut' && <Button variant="secondary" onClick={identity.signIn}>{t.nav.signIn}</Button>}
                {identity.status === 'phoneRequired' && <Button variant="secondary" onClick={identity.confirmPhone}>{copy.phoneRequired}</Button>}
                {verified && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                  <Button variant="secondary" disabled={decision !== null} isLoading={decision === 'reject'} onClick={() => void submit('reject')} leftIcon={<X size={16} />}>{copy.reject}</Button>
                  <Button variant="gold" disabled={decision !== null} isLoading={decision === 'accept'} onClick={() => void submit('accept')} leftIcon={<Check size={16} />}>{copy.accept}</Button>
                </div>}
                {decisionError && <p role="alert" className="zibi-field__error">{decisionError}</p>}
              </>
            )}
          </Card>
        )}
    </section>
  );
}

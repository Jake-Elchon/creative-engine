import { useCallback, useEffect, useState } from 'react';
import { Check, FileSignature, X } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { useToast } from '@/app/providers/ToastProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Card } from '@/components/ui/Card/Card';
import { EmptyState } from '@/components/ui/EmptyState/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState/ErrorState';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { SplitInvitationDetail } from '@/types/models';
import { extractInviteTokenFromHash } from '@/utils/url';

export function SplitInvitationPage() {
  const { inviteId = '' } = useParams<{ inviteId: string }>();
  const { hash } = useLocation();
  const { t } = useLanguage();
  const { pushToast } = useToast();

  // Extract opaque token strictly from URL fragment, never from query params or logs
  const inviteToken = extractInviteTokenFromHash(hash);

  const [invitation, setInvitation] = useState<SplitInvitationDetail | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(inviteToken));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInvitation = useCallback(async () => {
    if (!inviteToken || !inviteId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getSplitInvitation(inviteId, inviteToken);
      setInvitation(data);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : t.discovery.initialErrorServer,
      );
    } finally {
      setIsLoading(false);
    }
  }, [inviteId, inviteToken, t.discovery.initialErrorServer]);

  useEffect(() => {
    void loadInvitation();
  }, [loadInvitation]);

  const handleDecision = async (decision: 'ACCEPT' | 'REJECT') => {
    if (!inviteToken || !inviteId) return;
    setIsSubmitting(true);
    try {
      const updated = await apiClient.respondToSplitInvitation(
        inviteId,
        inviteToken,
        decision,
      );
      setInvitation(updated);
      pushToast(updated.status, decision === 'ACCEPT' ? 'success' : 'info');
    } catch (err) {
      pushToast(
        err instanceof ApiClientError ? err.message : t.discovery.initialErrorServer,
        'error',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className="zibi-container"
      style={{ paddingBlock: 'var(--space-12)', maxWidth: '640px' }}
    >
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--text-3xl)' }}>{t.invites.title}</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>
          {t.invites.subtitle}
        </p>
      </div>

      {!inviteToken ? (
        <EmptyState
          title={t.invites.missingTokenTitle}
          subtitle={t.invites.missingTokenBody}
          icon={<FileSignature size={24} />}
        />
      ) : isLoading ? (
        <Card>
          <LoadingIndicator />
        </Card>
      ) : error ? (
        <ErrorState
          title={t.invites.title}
          subtitle={error}
          onRetry={() => void loadInvitation()}
        />
      ) : invitation ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              {t.invites.statusLabel}
            </span>
            <Badge
              variant={
                invitation.status === 'ACCEPTED'
                  ? 'forest'
                  : invitation.status === 'REJECTED' || invitation.status === 'EXPIRED'
                    ? 'terracotta'
                    : 'gold'
              }
            >
              {invitation.status}
            </Badge>
          </div>

          <hr className="cultural-divider" />

          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t.invites.productLabel}
            </span>
            <h2 style={{ fontSize: 'var(--text-xl)' }}>{invitation.productTitle}</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t.invites.creatorLabel}
              </span>
              <p style={{ fontWeight: 'var(--font-semibold)' }}>
                {invitation.creatorDisplayName}
              </p>
            </div>
            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t.invites.shareLabel}
              </span>
              <p style={{ fontWeight: 'var(--font-bold)', color: 'var(--color-gold)', fontSize: 'var(--text-xl)' }}>
                {invitation.sharePercentage}%
              </p>
            </div>
          </div>

          {invitation.status === 'EXPIRED' ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--state-error)' }}>
              {t.invites.expiredNote}
            </p>
          ) : invitation.status === 'PENDING' ? (
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button
                variant="secondary"
                fullWidth
                disabled={isSubmitting}
                onClick={() => void handleDecision('REJECT')}
                leftIcon={<X size={16} />}
              >
                {t.invites.reject}
              </Button>
              <Button
                variant="gold"
                fullWidth
                isLoading={isSubmitting}
                onClick={() => void handleDecision('ACCEPT')}
                leftIcon={<Check size={16} />}
              >
                {t.invites.accept}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

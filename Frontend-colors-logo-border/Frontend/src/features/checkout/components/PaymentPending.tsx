import { RefreshCw, Smartphone } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { LoadingIndicator } from '@/components/ui/LoadingIndicator/LoadingIndicator';
import type { CheckoutTransaction } from '@/types/models';
import { formatMoney } from '@/utils/currency';

export interface PaymentPendingProps {
  transaction: CheckoutTransaction;
  statusError: string | null;
  isRefreshing: boolean;
  onRefresh?: () => void;
}

export function PaymentPending({
  transaction,
  statusError,
  isRefreshing,
  onRefresh,
}: PaymentPendingProps) {
  const { locale, t, formatMessage } = useLanguage();
  const isMtn = transaction.rail === 'mtn';
  const railLabel = isMtn ? t.checkout.railMtn : t.checkout.railOrange;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div
        style={{
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: isMtn
            ? '1px solid rgba(242, 183, 5, 0.4)'
            : '1px solid rgba(240, 138, 36, 0.45)',
          background: isMtn
            ? 'rgba(242, 183, 5, 0.08)'
            : 'rgba(240, 138, 36, 0.09)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
          <Badge variant={isMtn ? 'gold' : 'terracotta'}>{railLabel}</Badge>
          <strong style={{ fontSize: 'var(--text-base)' }}>
            {formatMoney(transaction.amountMinor, 'XAF', locale)}
          </strong>
        </div>

        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-lg)',
            marginTop: 'var(--space-1)',
          }}
        >
          <Smartphone size={18} />
          {isMtn ? t.checkout.pendingTitleMtn : t.checkout.pendingTitleOrange}
        </h3>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-normal)' }}>
          {t.checkout.pendingBody}
        </p>
      </div>

      <LoadingIndicator
        label={formatMessage(t.checkout.waitingConfirmation, { rail: railLabel })}
      />

      {statusError && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--state-error)' }} role="alert">
          {statusError}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          {t.checkout.transactionIdLabel}: {transaction.transactionId}
        </span>
      </div>

      {onRefresh && <Button
        type="button"
        variant="secondary"
        fullWidth
        isLoading={isRefreshing}
        onClick={onRefresh}
        leftIcon={<RefreshCw size={14} />}
      >
        {t.checkout.refreshStatus}
      </Button>}
    </div>
  );
}

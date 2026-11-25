import { CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import type { CheckoutTransaction } from '@/types/models';
import { formatMoney } from '@/utils/currency';

export interface PaymentSuccessProps {
  transaction: CheckoutTransaction;
  onContinue: () => void;
}

export function PaymentSuccess({ transaction, onContinue }: PaymentSuccessProps) {
  const { locale, t } = useLanguage();
  const railLabel = transaction.rail === 'mtn' ? t.checkout.railMtn : t.checkout.railOrange;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div
        style={{
          padding: 'var(--space-5)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--state-success-bg)',
          border: '1px solid rgba(30, 142, 90, 0.45)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'var(--space-2)',
        }}
      >
        <CheckCircle2 size={32} color="var(--state-success)" />
        <h3 style={{ fontSize: 'var(--text-xl)' }}>{t.checkout.successTitle}</h3>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
          {t.checkout.successSubtitle}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid var(--border-subtle)',
          fontSize: 'var(--text-sm)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t.checkout.amountLabel}</span>
          <strong>{formatMoney(transaction.amountMinor, 'XAF', locale)}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t.checkout.railLabel}</span>
          <Badge variant={transaction.rail === 'mtn' ? 'gold' : 'terracotta'}>
            {railLabel}
          </Badge>
        </div>
        {transaction.confirmedAt && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t.checkout.confirmedAtLabel}</span>
            <span>{new Date(transaction.confirmedAt).toLocaleString(locale)}</span>
          </div>
        )}
      </div>

      <Button type="button" variant="gold" fullWidth onClick={onContinue}>
        {t.checkout.continueAction}
      </Button>
    </div>
  );
}

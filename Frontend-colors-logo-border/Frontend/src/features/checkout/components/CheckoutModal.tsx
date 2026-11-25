import type { FormEvent } from 'react';
import { Mail, Smartphone } from 'lucide-react';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { Badge } from '@/components/ui/Badge/Badge';
import { Button } from '@/components/ui/Button/Button';
import { Input } from '@/components/ui/Input/Input';
import { Modal } from '@/components/ui/Modal/Modal';
import { PaymentFailed } from '@/features/checkout/components/PaymentFailed';
import { PaymentPending } from '@/features/checkout/components/PaymentPending';
import { PaymentRailSelector } from '@/features/checkout/components/PaymentRailSelector';
import { PaymentSuccess } from '@/features/checkout/components/PaymentSuccess';
import { useCheckout } from '@/features/checkout/hooks/useCheckout';
import { apiClient } from '@/services/api';
import type { CheckoutTransaction, StorefrontProduct } from '@/types/models';
import { formatMoney } from '@/utils/currency';
import { isValidXafAmountMinor, MAX_EMAIL_LENGTH } from '@/utils/validation';

export interface CheckoutModalProps {
  product: StorefrontProduct | null;
  creatorName?: string;
  onClose: () => void;
  onPriceChanged?: () => void;
  onPurchaseSuccess?: (tx: CheckoutTransaction) => void;
}

export function CheckoutModal({
  product,
  creatorName,
  onClose,
  onPriceChanged,
  onPurchaseSuccess,
}: CheckoutModalProps) {
  const { locale, t, formatMessage } = useLanguage();

  const checkout = useCheckout({
    product,
    onPriceChanged,
    onPurchaseSuccess,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await checkout.initiate();
  };

  const hasValidPrice = product ? isValidXafAmountMinor(product.xafPrice) : false;

  return (
    <Modal
      isOpen={Boolean(product)}
      onClose={onClose}
      title={product ? product.title : t.checkout.modalTitle}
    >
      {product && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {creatorName && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {t.checkout.creatorLabel}: <strong style={{ color: 'var(--text-secondary)' }}>{creatorName}</strong>
            </div>
          )}

          {apiClient.isMock && (
            <Badge variant="gold">{t.common.demoModeBanner}</Badge>
          )}

          {checkout.isSessionExpired || checkout.transaction?.status === 'FAILED' ? (
            <PaymentFailed
              isExpired={checkout.isSessionExpired}
              onRetryAttempt={checkout.startFreshAttempt}
              onBackToStorefront={onClose}
            />
          ) : checkout.transaction?.status === 'SUCCESS' ? (
            <PaymentSuccess
              transaction={checkout.transaction}
              onContinue={onClose}
            />
          ) : checkout.transaction?.status === 'PENDING' ? (
            <PaymentPending
              transaction={checkout.transaction}
              statusError={checkout.statusError}
              isRefreshing={checkout.isRefreshing}
              onRefresh={checkout.refreshStatus}
            />
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {t.checkout.amountLabel} (XAF)
                </span>
                <strong style={{ fontSize: 'var(--text-lg)', color: 'var(--color-gold)' }}>
                  {hasValidPrice
                    ? formatMoney(product.xafPrice, 'XAF', locale)
                    : '—'}
                </strong>
              </div>

              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t.checkout.currencyRuleNote}
              </p>

              {!hasValidPrice ? (
                <p className="zibi-field__error" role="alert">
                  {t.checkout.invalidPriceError}
                </p>
              ) : (
                <>
                  <PaymentRailSelector
                    value={checkout.rail}
                    onChange={checkout.setRail}
                    disabled={checkout.isSubmitting}
                  />

                  <Input
                    label={t.checkout.buyerPhoneLabel}
                    placeholder={t.checkout.buyerPhonePlaceholder}
                    hint={t.auth.phoneHint}
                    value={checkout.buyerPhone}
                    onChange={(e) => checkout.setBuyerPhone(e.target.value)}
                    leftIcon={<Smartphone size={16} />}
                    autoComplete="tel"
                  />

                  <Input
                    label={t.checkout.buyerEmailLabel}
                    placeholder={t.checkout.buyerEmailPlaceholder}
                    type="email"
                    maxLength={MAX_EMAIL_LENGTH}
                    value={checkout.buyerEmail}
                    onChange={(e) => checkout.setBuyerEmail(e.target.value)}
                    leftIcon={<Mail size={16} />}
                    autoComplete="email"
                  />

                  {checkout.error && (
                    <p className="zibi-field__error" role="alert">
                      {checkout.error}
                    </p>
                  )}

                  <Button type="submit" fullWidth isLoading={checkout.isSubmitting}>
                    {formatMessage(t.checkout.confirmPay, {
                      amount: formatMoney(product.xafPrice, 'XAF', locale),
                    })}
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}

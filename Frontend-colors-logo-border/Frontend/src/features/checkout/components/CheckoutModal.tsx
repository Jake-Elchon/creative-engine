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
import { checkoutAmount } from '@/features/storefront/catalog';
import { MAX_EMAIL_LENGTH } from '@/utils/validation';

export interface CheckoutModalProps {
  product: StorefrontProduct;
  isOpen: boolean;
  creatorName?: string;
  onClose: () => void;
  onRelease: () => void;
  onPriceChanged: () => Promise<StorefrontProduct | null>;
  onPurchaseSuccess?: (tx: CheckoutTransaction) => void;
}

export function CheckoutModal({
  product,
  isOpen,
  creatorName,
  onClose,
  onRelease,
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

  const currentProduct = checkout.priceReview?.product ?? product;
  const amount = checkoutAmount(currentProduct);
  const hasValidPrice = currentProduct.checkoutAvailable && amount !== null && amount >= 100;
  const review = checkout.priceReview;
  const reviewBlocked = review !== null && review.state !== 'ready';

  function close() {
    onClose();
    if (!checkout.isSubmitting && !checkout.transaction && !checkout.uncertainAttempt && !review) onRelease();
  }

  function finish() {
    onClose();
    onRelease();
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title={t.productTypes[product.type.code] || t.checkout.modalTitle}
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
              onRetryAttempt={checkout.isSessionExpired ? undefined : checkout.startFreshAttempt}
              onBackToStorefront={checkout.isSessionExpired ? close : finish}
            />
          ) : checkout.transaction?.status === 'SUCCESS' ? (
            <PaymentSuccess
              transaction={checkout.transaction}
              onContinue={finish}
            />
          ) : checkout.transaction?.status === 'PENDING' ? (
            <PaymentPending
              transaction={checkout.transaction}
              statusError={checkout.statusError}
              isRefreshing={checkout.isRefreshing}
              onRefresh={checkout.canRefreshStatus ? checkout.refreshStatus : undefined}
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
                  {hasValidPrice && !reviewBlocked && amount !== null
                    ? formatMoney(amount, 'XAF', locale)
                    : '—'}
                </strong>
              </div>

              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t.checkout.currencyRuleNote}
              </p>

              {review?.state === 'loading' && <p role="status">{t.common.loading}</p>}
              {review?.state === 'failed' && <>
                <p role="alert" className="zibi-field__error">{t.checkout.priceRefreshFailed}</p>
                <Button variant="secondary" onClick={checkout.retryPrice}>{t.checkout.priceRefresh}</Button>
              </>}
              {review?.state === 'unavailable' && (
                <p role="alert" className="zibi-field__error">{t.checkout.unavailableReview}</p>
              )}
              {review?.state === 'ready' && amount !== null && (
                <p role="status">
                  {amount === review.previous ? t.checkout.priceChangedBody : formatMessage(t.checkout.priceReview, {
                    old: formatMoney(review.previous, 'XAF', locale),
                    current: formatMoney(amount, 'XAF', locale),
                  })}
                </p>
              )}

              {reviewBlocked ? null : !hasValidPrice || amount === null ? (
                <p className="zibi-field__error" role="alert">
                  {t.checkout.invalidPriceError}
                </p>
              ) : (
                <>
                  <PaymentRailSelector
                    value={checkout.rail}
                    onChange={checkout.setRail}
                    disabled={checkout.isSubmitting || checkout.uncertainAttempt}
                  />

                  <Input
                    label={t.checkout.buyerPhoneLabel}
                    placeholder={t.checkout.buyerPhonePlaceholder}
                    hint={t.checkout.mobilePhone}
                    value={checkout.buyerPhone}
                    onChange={(e) => checkout.setBuyerPhone(e.target.value)}
                    leftIcon={<Smartphone size={16} />}
                    autoComplete="tel"
                    disabled={checkout.isSubmitting || checkout.uncertainAttempt}
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
                    disabled={checkout.isSubmitting || checkout.uncertainAttempt}
                  />

                  {checkout.error && (!review || checkout.error !== t.checkout.priceChangedBody) && (
                    <p className="zibi-field__error" role="alert">
                      {checkout.error}
                    </p>
                  )}

                  <Button type="submit" fullWidth isLoading={checkout.isSubmitting}>
                    {formatMessage(t.checkout.confirmPay, {
                      amount: formatMoney(amount, 'XAF', locale),
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

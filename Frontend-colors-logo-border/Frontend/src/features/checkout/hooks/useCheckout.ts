import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { checkoutAmount } from '@/features/storefront/catalog';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { CheckoutTransaction, PaymentRailOption, StorefrontProduct } from '@/types/models';
import { isValidEmail, isValidXafAmountMinor } from '@/utils/validation';

export interface UseCheckoutOptions {
  product: StorefrontProduct | null;
  pollingIntervalMs?: number;
  onPriceChanged?: () => Promise<StorefrontProduct | null>;
  onPurchaseSuccess?: (tx: CheckoutTransaction) => void;
}

type PriceReview = {
  previous: number;
  state: 'loading' | 'failed' | 'unavailable' | 'ready';
  product?: StorefrontProduct;
};

export function useCheckout({ product, pollingIntervalMs = 3000, onPriceChanged, onPurchaseSuccess }: UseCheckoutOptions) {
  const { session } = useAuth();
  const { t } = useLanguage();
  const [buyerPhone, setBuyerPhone] = useState(session?.user.phone ?? '+237');
  const [buyerEmail, setBuyerEmail] = useState(session?.user.email ?? '');
  const [rail, setRail] = useState<PaymentRailOption>('auto');
  const [transaction, setTransaction] = useState<CheckoutTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBlocked, setStatusBlocked] = useState<'identity' | 'missing' | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [priceReview, setPriceReview] = useState<PriceReview | null>(null);
  const [uncertainAttempt, setUncertainAttempt] = useState(false);
  const inFlight = useRef(false);
  const pollingInFlight = useRef(false);
  const failureCount = useRef(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const buyer = useRef<string | null>(null);
  const notified = useRef<string | null>(null);

  const sessionId = session?.user.id ?? null;
  const txId = transaction?.transactionId;
  const txStatus = transaction?.status;
  const guestToken = transaction?.guestSessionToken;
  const guestExpiry = transaction?.guestSessionExpiresAt;
  const registered = transaction?.isRegisteredBuyer;

  useEffect(() => {
    if (!txId && !uncertainAttempt && session?.user) {
      setBuyerPhone(session.user.phone || '+237');
      setBuyerEmail(session.user.email ?? '');
    }
  }, [session?.user, txId, uncertainAttempt]);

  const refreshPrice = useCallback(async (previous: number) => {
    setPriceReview({ state: 'loading', previous });
    try {
      if (!onPriceChanged) {
        setPriceReview({ state: 'failed', previous });
        return;
      }
      const updated = await onPriceChanged();
      const current = updated && checkoutAmount(updated);
      if (!updated?.checkoutAvailable || !current || current < 100) {
        setPriceReview({ state: 'unavailable', previous });
      } else {
        setPriceReview({ state: 'ready', previous, product: updated });
      }
    } catch {
      setPriceReview({ state: 'failed', previous });
    }
  }, [onPriceChanged]);

  async function initiate(): Promise<boolean> {
    if (!product || inFlight.current || transaction || (priceReview && priceReview.state !== 'ready')) return false;
    setError(null);
    const current = priceReview?.product ?? product;
    const amount = checkoutAmount(current);
    if (!current.checkoutAvailable || !isValidXafAmountMinor(amount) || amount < 100) {
      setError(t.checkout.invalidPriceError);
      return false;
    }
    if (!/^\+2376\d{8}$/.test(buyerPhone)) {
      setError(t.checkout.mobilePhone);
      return false;
    }
    const email = buyerEmail.trim();
    if (!isValidEmail(email)) {
      setError(t.checkout.invalidEmail);
      return false;
    }
    const request = {
      productId: current.productId, buyerPhone, buyerEmail: email, expectedAmountMinor: amount, rail,
    };
    const signature = JSON.stringify([sessionId, request]);
    if (uncertainAttempt && attempt.current?.signature !== signature) {
      setError(t.checkout.statusIdentity);
      return false;
    }
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: crypto.randomUUID() };
    }

    buyer.current = sessionId;
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      const result = await apiClient.initiateCheckout({ request, idempotencyKey: attempt.current.key });
      setTransaction(result);
      setStatusBlocked(null);
      setStatusError(null);
      setIsSessionExpired(false);
      setUncertainAttempt(false);
      failureCount.current = 0;
      return true;
    } catch (failure) {
      if (failure instanceof ApiClientError) {
        setUncertainAttempt(failure.status === 0 || (failure.status >= 500 && failure.code !== 'PAYMENT_UNAVAILABLE') || failure.code === 'INVALID_JSON' || failure.code === 'INVALID_ENVELOPE');
        switch (failure.code) {
          case 'PRICE_CHANGED':
            attempt.current = null;
            setError(t.checkout.priceChangedBody);
            await refreshPrice(amount);
            break;
          case 'IDEMPOTENCY_CONFLICT': setError(t.checkout.idempotencyConflict); break;
          case 'NETWORK_MISMATCH': setError(t.checkout.networkMismatch); break;
          case 'UNSUPPORTED_NETWORK': setError(t.checkout.unsupportedNetwork); break;
          case 'PRODUCT_UNAVAILABLE': setError(t.checkout.productUnavailable); break;
          case 'PRODUCT_NOT_FOUND': setError(t.checkout.productNotFound); break;
          case 'INVALID_TOKEN':
          case 'UNAUTHENTICATED': setError(t.checkout.invalidToken); break;
          default: setError(t.checkout.paymentUnavailable);
        }
      } else {
        setUncertainAttempt(true);
        setError(t.checkout.paymentUnavailable);
      }
      return false;
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }

  const pollStatus = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!txId || txStatus !== 'PENDING' || isSessionExpired || statusBlocked === 'missing') return false;
    if (pollingInFlight.current) return true;
    if ((!registered && !guestToken) || (registered && (!sessionId || sessionId !== buyer.current))) {
      setStatusBlocked('identity');
      setStatusError(t.checkout.statusIdentity);
      return false;
    }
    if (!registered && guestExpiry && Date.parse(guestExpiry) <= Date.now()) {
      setIsSessionExpired(true);
      return false;
    }

    pollingInFlight.current = true;
    setIsRefreshing(true);
    try {
      const next = await apiClient.getCheckoutStatus(txId, registered ? undefined : guestToken, signal);
      if (signal?.aborted) return false;
      failureCount.current = 0;
      setStatusError(null);
      setStatusBlocked(null);
      setTransaction((current) => current?.transactionId === txId ? { ...current, ...next } : current);
      if (next.status === 'SUCCESS' && notified.current !== next.transactionId) {
        notified.current = next.transactionId;
        onPurchaseSuccess?.(next);
      }
      return next.status === 'PENDING';
    } catch (failure) {
      if (signal?.aborted) return false;
      if (failure instanceof ApiClientError) {
        if (failure.status === 410) {
          setIsSessionExpired(true);
          return false;
        }
        if (failure.status === 401) {
          setStatusBlocked('identity');
          setStatusError(t.checkout.statusIdentity);
          return false;
        }
        if (failure.status === 404) {
          setStatusBlocked('missing');
          setStatusError(t.checkout.txNotFound);
          return false;
        }
      }
      failureCount.current += 1;
      setStatusError(t.checkout.statusRetry);
      return true;
    } finally {
      pollingInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [guestExpiry, guestToken, isSessionExpired, onPurchaseSuccess, registered, sessionId, statusBlocked, t.checkout, txId, txStatus]);

  useEffect(() => {
    if (!txId || txStatus !== 'PENDING' || isSessionExpired || statusBlocked) return;
    const controller = new AbortController();
    let timer: number;
    function schedule() {
      timer = window.setTimeout(async () => {
        const keepPolling = await pollStatus(controller.signal);
        if (keepPolling && !controller.signal.aborted) schedule();
      }, pollingIntervalMs * Math.min(2 ** failureCount.current, 4));
    }
    schedule();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isSessionExpired, pollStatus, pollingIntervalMs, statusBlocked, txId, txStatus]);

  function startFreshAttempt() {
    if (transaction?.status !== 'FAILED') return;
    setTransaction(null);
    setError(null);
    setStatusError(null);
    setStatusBlocked(null);
    attempt.current = null;
    failureCount.current = 0;
    notified.current = null;
  }

  return {
    buyerPhone, setBuyerPhone, buyerEmail, setBuyerEmail, rail, setRail,
    transaction, error, statusError, isSessionExpired, isSubmitting, isRefreshing, priceReview, uncertainAttempt,
    canRefreshStatus: statusBlocked !== 'missing',
    initiate, refreshStatus: () => void pollStatus(), startFreshAttempt,
    retryPrice: () => priceReview && !inFlight.current && priceReview.state !== 'loading' && void refreshPrice(priceReview.previous),
  };
}

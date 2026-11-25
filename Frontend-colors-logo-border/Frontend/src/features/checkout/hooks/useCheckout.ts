import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useLanguage } from '@/app/providers/LanguageProvider';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type {
  CheckoutTransaction,
  PaymentRailOption,
  StorefrontProduct,
} from '@/types/models';
import {
  isValidCameroonPhone,
  isValidEmail,
  isValidXafAmountMinor,
} from '@/utils/validation';

function createIdempotencyKey(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `zibi_${Date.now().toString(36)}_${rand}`.slice(0, 64);
}

export interface UseCheckoutOptions {
  product: StorefrontProduct | null;
  pollingIntervalMs?: number;
  onPriceChanged?: () => void;
  onPurchaseSuccess?: (tx: CheckoutTransaction) => void;
}

export function useCheckout({
  product,
  pollingIntervalMs = 3000,
  onPriceChanged,
  onPurchaseSuccess,
}: UseCheckoutOptions) {
  const { session } = useAuth();
  const { t } = useLanguage();

  const [buyerPhone, setBuyerPhone] = useState(session?.user.phone || '+237');
  const [buyerEmail, setBuyerEmail] = useState(session?.user.email || '');
  const [rail, setRail] = useState<PaymentRailOption>('auto');

  const [transaction, setTransaction] = useState<CheckoutTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);
  const pollingInFlightRef = useRef(false);
  const consecutiveFailuresRef = useRef(0);
  const successNotifiedRef = useRef<string | null>(null);

  // Sync user defaults when session changes and no tx is active
  useEffect(() => {
    if (!transaction && session?.user) {
      if (session.user.phone) setBuyerPhone(session.user.phone);
      if (session.user.email) setBuyerEmail(session.user.email);
    }
  }, [session, transaction]);

  // Reset state when product changes or modal closes
  useEffect(() => {
    if (!product) {
      setTransaction(null);
      setError(null);
      setStatusError(null);
      setIsSessionExpired(false);
      idempotencyRef.current = null;
      consecutiveFailuresRef.current = 0;
      successNotifiedRef.current = null;
    }
  }, [product]);

  const getOrCreateIdempotencyKey = useCallback(
    (signature: string): string => {
      if (idempotencyRef.current && idempotencyRef.current.signature === signature) {
        return idempotencyRef.current.key;
      }
      const nextKey = createIdempotencyKey();
      idempotencyRef.current = { signature, key: nextKey };
      return nextKey;
    },
    [],
  );

  const startFreshAttempt = useCallback(() => {
    setTransaction(null);
    setError(null);
    setStatusError(null);
    setIsSessionExpired(false);
    idempotencyRef.current = null;
    consecutiveFailuresRef.current = 0;
    successNotifiedRef.current = null;
  }, []);

  const initiate = useCallback(async (): Promise<boolean> => {
    if (!product || isSubmitting) return false;
    setError(null);

    if (!isValidXafAmountMinor(product.xafPrice)) {
      setError(t.checkout.invalidPriceError);
      return false;
    }

    if (!isValidCameroonPhone(buyerPhone)) {
      setError(t.auth.invalidPhone);
      return false;
    }

    const trimmedEmail = buyerEmail.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError(t.checkout.invalidEmail);
      return false;
    }

    const signature = JSON.stringify({
      productId: product.productId,
      buyerPhone,
      buyerEmail: trimmedEmail,
      expectedAmountMinor: product.xafPrice,
      rail,
      auth: Boolean(session?.accessToken),
    });

    const idempotencyKey = getOrCreateIdempotencyKey(signature);

    setIsSubmitting(true);
    try {
      const tx = await apiClient.initiateCheckout({
        request: {
          productId: product.productId,
          buyerPhone,
          buyerEmail: trimmedEmail,
          expectedAmountMinor: product.xafPrice,
          rail,
        },
        idempotencyKey,
      });

      setTransaction(tx);
      setStatusError(null);
      setIsSessionExpired(false);
      consecutiveFailuresRef.current = 0;
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        switch (err.code) {
          case 'PRICE_CHANGED':
            idempotencyRef.current = null;
            setError(t.checkout.priceChangedBody);
            onPriceChanged?.();
            break;
          case 'IDEMPOTENCY_CONFLICT':
            idempotencyRef.current = null;
            setError(t.checkout.idempotencyConflict);
            break;
          case 'NETWORK_MISMATCH':
            setError(t.checkout.networkMismatch);
            break;
          case 'UNSUPPORTED_NETWORK':
            setError(t.checkout.unsupportedNetwork);
            break;
          case 'PRODUCT_UNAVAILABLE':
            setError(t.checkout.productUnavailable);
            break;
          case 'PRODUCT_NOT_FOUND':
            setError(t.checkout.productNotFound);
            break;
          case 'INVALID_TOKEN':
            setError(t.checkout.invalidToken);
            break;
          case 'PAYMENT_UNAVAILABLE':
            setError(t.checkout.paymentUnavailable);
            break;
          default:
            setError(err.message);
        }
      } else {
        setError(t.checkout.paymentUnavailable);
      }
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    buyerEmail,
    buyerPhone,
    getOrCreateIdempotencyKey,
    isSubmitting,
    onPriceChanged,
    product,
    rail,
    session?.accessToken,
    t.auth.invalidPhone,
    t.checkout,
  ]);

  const pollStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!transaction || pollingInFlightRef.current) return;
      if (transaction.status !== 'PENDING' || isSessionExpired) return;

      // Check guest session expiry locally before polling if present
      if (
        !transaction.isRegisteredBuyer &&
        transaction.guestSessionExpiresAt &&
        Date.parse(transaction.guestSessionExpiresAt) <= Date.now()
      ) {
        setIsSessionExpired(true);
        return;
      }

      pollingInFlightRef.current = true;
      setIsRefreshing(true);

      try {
        const guestToken = transaction.isRegisteredBuyer
          ? undefined
          : transaction.guestSessionToken;

        const updated = await apiClient.getCheckoutStatus(
          transaction.transactionId,
          guestToken,
          signal,
        );

        consecutiveFailuresRef.current = 0;
        setStatusError(null);
        setTransaction((prev) =>
          prev
            ? {
                ...prev,
                ...updated,
                guestSessionToken: prev.guestSessionToken,
                guestSessionExpiresAt: prev.guestSessionExpiresAt,
              }
            : updated,
        );

        if (
          updated.status === 'SUCCESS' &&
          successNotifiedRef.current !== updated.transactionId
        ) {
          successNotifiedRef.current = updated.transactionId;
          onPurchaseSuccess?.(updated);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        consecutiveFailuresRef.current += 1;

        if (err instanceof ApiClientError) {
          if (err.status === 410 || err.code === 'CHECKOUT_SESSION_EXPIRED') {
            setIsSessionExpired(true);
            return;
          }
          if (err.status === 401 || err.code === 'UNAUTHENTICATED') {
            setStatusError(t.checkout.unauthenticatedStatus);
            return;
          }
          if (err.status === 404 || err.code === 'TRANSACTION_NOT_FOUND') {
            setStatusError(t.checkout.txNotFound);
            return;
          }
          setStatusError(err.message);
        } else {
          setStatusError(t.discovery.initialErrorNetwork);
        }
      } finally {
        pollingInFlightRef.current = false;
        setIsRefreshing(false);
      }
    },
    [
      isSessionExpired,
      onPurchaseSuccess,
      t.checkout.txNotFound,
      t.checkout.unauthenticatedStatus,
      t.discovery.initialErrorNetwork,
      transaction,
    ],
  );

  // Automatic status polling with exponential backoff on transient failures
  useEffect(() => {
    if (!transaction || transaction.status !== 'PENDING' || isSessionExpired) {
      return;
    }

    const controller = new AbortController();
    const backoffFactor = Math.min(2 ** consecutiveFailuresRef.current, 4);
    const delay = pollingIntervalMs * backoffFactor;

    const timer = window.setTimeout(() => {
      void pollStatus(controller.signal);
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isSessionExpired, pollStatus, pollingIntervalMs, transaction]);

  return {
    buyerPhone,
    setBuyerPhone,
    buyerEmail,
    setBuyerEmail,
    rail,
    setRail,
    transaction,
    error,
    statusError,
    isSessionExpired,
    isSubmitting,
    isRefreshing,
    initiate,
    refreshStatus: () => void pollStatus(),
    startFreshAttempt,
  };
}

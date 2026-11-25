import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { LanguageProvider } from '@/app/providers/LanguageProvider';
import { ToastProvider } from '@/app/providers/ToastProvider';
import { useCheckout } from '@/features/checkout/hooks/useCheckout';
import { apiClient } from '@/services/api';
import { ApiClientError } from '@/types/api';
import type { StorefrontProduct } from '@/types/models';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <LanguageProvider>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </LanguageProvider>
  );
}

const sampleProduct: StorefrontProduct = {
  productId: '11111111-1111-1111-1111-111111111111',
  title: 'Wouri Sunrise',
  description: 'EP',
  type: 'MUSIC',
  previewAvailable: true,
  xafPrice: 2500,
  splitsComplete: true,
};

describe('useCheckout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('prevents checkout when XAF price is invalid', async () => {
    const initSpy = vi.spyOn(apiClient, 'initiateCheckout');
    const invalidProduct = { ...sampleProduct, xafPrice: 0 };

    const { result } = renderHook(
      () => useCheckout({ product: invalidProduct }),
      { wrapper },
    );

    act(() => {
      result.current.setBuyerPhone('+237677000000');
      result.current.setBuyerEmail('fan@example.com');
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.initiate();
    });

    expect(ok).toBe(false);
    expect(initSpy).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it('reuses Idempotency-Key for identical retry and regenerates on changed context', async () => {
    const initSpy = vi
      .spyOn(apiClient, 'initiateCheckout')
      .mockRejectedValueOnce(
        new ApiClientError({
          message: 'Unavailable',
          code: 'PAYMENT_UNAVAILABLE',
          status: 503,
          kind: 'SERVICE_UNAVAILABLE',
        }),
      )
      .mockResolvedValue({
        transactionId: 'tx_1',
        currencyCode: 'XAF',
        amountMinor: 2500,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        isRegisteredBuyer: false,
        status: 'PENDING',
        rail: 'mtn',
        guestSessionToken: 'gst_123',
        guestSessionExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      });

    const { result } = renderHook(
      () => useCheckout({ product: sampleProduct, pollingIntervalMs: 60_000 }),
      { wrapper },
    );

    act(() => {
      result.current.setBuyerPhone('+237677000000');
      result.current.setBuyerEmail('fan@example.com');
      result.current.setRail('mtn');
    });

    await act(async () => {
      await result.current.initiate();
    });
    const firstKey = initSpy.mock.calls[0]?.[0].idempotencyKey;

    await act(async () => {
      await result.current.initiate();
    });
    const retryKey = initSpy.mock.calls[1]?.[0].idempotencyKey;

    expect(firstKey).toBeTruthy();
    expect(retryKey).toBe(firstKey);

    act(() => {
      result.current.setRail('orange');
    });

    await act(async () => {
      await result.current.initiate();
    });
    const changedKey = initSpy.mock.calls[2]?.[0].idempotencyKey;
    expect(changedKey).not.toBe(firstKey);
  });

  it('handles PRICE_CHANGED by invoking onPriceChanged callback', async () => {
    const onPriceChanged = vi.fn();
    vi.spyOn(apiClient, 'initiateCheckout').mockRejectedValue(
      new ApiClientError({
        message: 'Price changed',
        code: 'PRICE_CHANGED',
        status: 409,
        kind: 'CONFLICT',
      }),
    );

    const { result } = renderHook(
      () => useCheckout({ product: sampleProduct, onPriceChanged }),
      { wrapper },
    );

    act(() => {
      result.current.setBuyerPhone('+237677000000');
      result.current.setBuyerEmail('fan@example.com');
    });

    await act(async () => {
      await result.current.initiate();
    });

    expect(onPriceChanged).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeTruthy();
  });

  it('polls guest status with guest token from PENDING to SUCCESS and stops polling', async () => {
    vi.useFakeTimers();

    vi.spyOn(apiClient, 'initiateCheckout').mockResolvedValue({
      transactionId: 'tx_poll_1',
      currencyCode: 'XAF',
      amountMinor: 2500,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      isRegisteredBuyer: false,
      status: 'PENDING',
      rail: 'orange',
      guestSessionToken: 'guest_tok_abc',
      guestSessionExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const statusSpy = vi
      .spyOn(apiClient, 'getCheckoutStatus')
      .mockResolvedValueOnce({
        transactionId: 'tx_poll_1',
        currencyCode: 'XAF',
        amountMinor: 2500,
        createdAt: new Date().toISOString(),
        confirmedAt: null,
        isRegisteredBuyer: false,
        status: 'PENDING',
        rail: 'orange',
      })
      .mockResolvedValueOnce({
        transactionId: 'tx_poll_1',
        currencyCode: 'XAF',
        amountMinor: 2500,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
        isRegisteredBuyer: false,
        status: 'SUCCESS',
        rail: 'orange',
      });

    const onPurchaseSuccess = vi.fn();

    const { result } = renderHook(
      () =>
        useCheckout({
          product: sampleProduct,
          pollingIntervalMs: 1000,
          onPurchaseSuccess,
        }),
      { wrapper },
    );

    act(() => {
      result.current.setBuyerPhone('+237677000000');
      result.current.setBuyerEmail('fan@example.com');
    });

    await act(async () => {
      await result.current.initiate();
    });
    expect(result.current.transaction?.status).toBe('PENDING');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(statusSpy).toHaveBeenCalledWith(
      'tx_poll_1',
      'guest_tok_abc',
      expect.any(AbortSignal),
    );
    expect(result.current.transaction?.status).toBe('PENDING');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.transaction?.status).toBe('SUCCESS');
    expect(onPurchaseSuccess).toHaveBeenCalledTimes(1);

    // Ensure polling stops after SUCCESS
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(statusSpy).toHaveBeenCalledTimes(2);
  });

  it('handles 410 CHECKOUT_SESSION_EXPIRED and stops polling', async () => {
    vi.useFakeTimers();

    vi.spyOn(apiClient, 'initiateCheckout').mockResolvedValue({
      transactionId: 'tx_exp_1',
      currencyCode: 'XAF',
      amountMinor: 2500,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      isRegisteredBuyer: false,
      status: 'PENDING',
      rail: 'mtn',
      guestSessionToken: 'guest_tok_exp',
      guestSessionExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    });

    const statusSpy = vi.spyOn(apiClient, 'getCheckoutStatus').mockRejectedValue(
      new ApiClientError({
        message: 'Expired',
        code: 'CHECKOUT_SESSION_EXPIRED',
        status: 410,
        kind: 'GONE',
      }),
    );

    const { result } = renderHook(
      () => useCheckout({ product: sampleProduct, pollingIntervalMs: 1000 }),
      { wrapper },
    );

    act(() => {
      result.current.setBuyerPhone('+237677000000');
      result.current.setBuyerEmail('fan@example.com');
    });

    await act(async () => {
      await result.current.initiate();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.isSessionExpired).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(statusSpy).toHaveBeenCalledTimes(1);
  });
});

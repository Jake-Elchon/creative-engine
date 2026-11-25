import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpApiAdapter } from '@/services/api/adapters/httpAdapter';
import { setAuthTokenProvider } from '@/services/api/client';
import { checkoutAmount, getDisplayPrice } from '@/features/storefront/catalog';
import { formatMoney } from '@/utils/currency';
import type { StorefrontDetail } from '@/types/models';

const api = new HttpApiAdapter();

afterEach(() => {
  vi.unstubAllGlobals();
  setAuthTokenProvider(null);
});

describe('API v1 HTTP adapter', () => {
  it('loads the documented storefront shape and selects prices in minor units', async () => {
    const data: StorefrontDetail = {
      storefront: { storefrontId: 'shop', handle: 'music', displayName: 'Music', storefrontUrl: '/@music', bio: null },
      products: [
        { productId: 'unpriced', description: null, type: { id: 'type', code: 'video', name: 'Video' },
          previewUrl: null, prices: [], displayCurrency: 'XAF', checkoutAvailable: false },
        { productId: 'priced', description: null, type: { id: 'type', code: 'video', name: 'Video' },
          previewUrl: '/api/v1/products/priced/media/audio', displayCurrency: 'EUR', checkoutAvailable: true,
          prices: [{ priceId: 'xaf', currencyCode: 'XAF', amountMinor: 1000 }, { priceId: 'eur', currencyCode: 'EUR', amountMinor: 250 }] },
      ],
      nextCursor: 'opaque',
    };
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      expect(new URL(url).pathname).toBe('/api/v1/storefront/music');
      expect(new URL(url).searchParams.get('displayCurrency')).toBe('EUR');
      expect(new Headers(options.headers).has('Authorization')).toBe(false);
      return new Response(JSON.stringify({ data, requestId: 'catalog' }));
    });
    vi.stubGlobal('fetch', fetch);
    setAuthTokenProvider(() => 'app-credential');

    const catalog = await api.getPublicStorefront({ handle: '@music', displayCurrency: 'EUR' });
    expect(catalog.storefront.bio).toBeNull();
    expect(catalog.nextCursor).toBe('opaque');
    expect(checkoutAmount(catalog.products[0])).toBeNull();
    expect(checkoutAmount(catalog.products[1])).toBe(1000);
    expect(getDisplayPrice(catalog.products[1])?.amountMinor).toBe(250);
    expect(formatMoney(250, 'EUR')).toContain('2.50');
    expect(formatMoney(1000, 'XAF')).toMatch(/1.000 FCFA/);
  });

  it('uses multipart with no manually assigned boundary and handles binary media separately', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { productId: 'product' } }), { status: 201 }))
      .mockResolvedValueOnce(new Response('sound', { status: 206, headers: { 'Content-Type': 'audio/mpeg' } }));
    vi.stubGlobal('fetch', fetch);
    setAuthTokenProvider(() => 'owner');

    const audioFile = new File(['sound'], 'audio.mp3', { type: 'audio/mpeg' });
    const videoPreviewFile = new File(['clip'], 'clip.webm', { type: 'video/webm' });
    await api.createProduct('store', { typeCode: 'release', audioFile, videoPreviewFile });
    const upload = fetch.mock.calls[0][1] as RequestInit;
    expect(new Headers(upload.headers).get('Authorization')).toBe('Bearer owner');
    expect(new Headers(upload.headers).has('Content-Type')).toBe(false);
    const fields = upload.body as FormData;
    expect(fields.get('typeCode')).toBe('release');
    expect(fields.get('audioFile')).toBe(audioFile);
    expect(fields.get('videoPreviewFile')).toBe(videoPreviewFile);
    expect(fields.get('videoFile')).toBeNull();

    const media = await api.getProductMedia('product', 'audio', { range: 'bytes=0-4' });
    const mediaRequest = fetch.mock.calls[1][1] as RequestInit;
    expect(media.type).toBe('audio/mpeg');
    expect(new Headers(mediaRequest.headers).has('Authorization')).toBe(false);
    expect(new Headers(mediaRequest.headers).get('Range')).toBe('bytes=0-4');
  });

  it('omits the app bearer for the invitation read and uses the explicit verified bearer on a decision', async () => {
    const data = { inviteId: 'invite', splitId: 'split', productId: 'product', shareBps: 2500, status: 'PENDING' };
    const fetch = vi.fn(async () => new Response(JSON.stringify({ data })));
    vi.stubGlobal('fetch', fetch);
    setAuthTokenProvider(() => 'local-otp');

    await api.getSplitInvitation('invite', 'opaque');
    await api.respondToSplitInvitation('invite', 'opaque', 'reject', { accessToken: 'verified', phoneConfirmed: true });
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(new URL(calls[0][0]).pathname).toBe('/api/v1/split-invitations/invite/decision');
    expect(new URL(calls[0][0]).search).toBe('');
    expect(new Headers(calls[0][1].headers).get('X-Invite-Token')).toBe('opaque');
    expect(new Headers(calls[0][1].headers).has('Authorization')).toBe(false);
    expect(calls[1][1].method).toBe('POST');
    expect(new Headers(calls[1][1].headers).get('Authorization')).toBe('Bearer verified');
    expect(JSON.parse(String(calls[1][1].body))).toEqual({ decision: 'reject' });
  });

  it('uploads the unmodified image body, removes it, and checks owner-only split status', async () => {
    const picture = new File(['png bytes'], 'picture.png', { type: 'image/png' });
    const profile = { storefrontId: 'store', profileImageUrl: '/api/v1/storefronts/store/profile-image?v=one' };
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: profile })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { ...profile, profileImageUrl: null } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: null })));
    vi.stubGlobal('fetch', fetch);
    setAuthTokenProvider(() => 'owner');

    await expect(api.uploadProfileImage('store', picture)).resolves.toMatchObject(profile);
    await expect(api.removeProfileImage('store')).resolves.toMatchObject({ profileImageUrl: null });
    await expect(api.getActiveSplit('product')).resolves.toBeNull();

    const [[putUrl, put], [deleteUrl, remove], [splitUrl, split]] = fetch.mock.calls as [string, RequestInit][];
    expect(new URL(putUrl).pathname).toBe('/api/v1/storefronts/store/profile-image');
    expect(put.method).toBe('PUT');
    expect(put.body).toBe(picture);
    expect(new Headers(put.headers).get('Content-Type')).toBe('image/png');
    expect(deleteUrl).toBe(putUrl);
    expect(remove.method).toBe('DELETE');
    expect(remove.body).toBeUndefined();
    expect(new URL(splitUrl).pathname).toBe('/api/v1/products/product/splits');
    expect(split.method).toBe('GET');
    expect(split.cache).toBe('no-store');
    for (const request of [put, remove, split]) {
      expect(new Headers(request.headers).get('Authorization')).toBe('Bearer owner');
    }
  });

  it('preserves a non-JSON rate-limit response and request ID', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Slow down', {
      status: 429, headers: { 'Retry-After': '12', 'X-Request-ID': 'gateway-1' },
    })));
    await expect(api.discoverArtists()).rejects.toMatchObject({
      status: 429, kind: 'RATE_LIMITED', retryAfterSeconds: 12, requestId: 'gateway-1',
    });
  });
});

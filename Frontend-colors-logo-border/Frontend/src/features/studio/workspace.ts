import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { apiClient } from '@/services/api';
import { isValidUuid } from '@/utils/validation';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary, OwnedProduct, ProductPricesResponse, StudioInventory } from '@/types/models';
import type { TranslationDictionary } from '@/i18n/locales/en';

export interface StudioWorkspace {
  storefront: ArtistSummary | null;
  setStorefront(storefront: ArtistSummary): void;
  storefronts: ArtistSummary[];
  inventory?: StudioInventory;
  inventoryError: unknown;
  inventoryLoading: boolean;
  loadInventory(cursor?: string): Promise<void>;
  recordProduct(product: OwnedProduct): void;
  recordPrices(prices: ProductPricesResponse): void;
}

export function useStudioWorkspace() {
  return useOutletContext<StudioWorkspace>();
}

export function useOwnedProduct(id: string, inventory?: StudioInventory) {
  const listed = inventory?.products.find(({ productId }) => productId === id);
  const [remote, setRemote] = useState<{ id: string; product?: OwnedProduct; error?: unknown }>();
  const [retry, setRetry] = useState(0);
  const lookup = isValidUuid(id) && !listed;
  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    void apiClient.getStudioInventory({ productId: id, signal: controller.signal }).then(({ products }) => {
      if (!controller.signal.aborted) setRemote({ id, product: products[0] });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setRemote({ id, error });
    });
    return () => controller.abort();
  }, [id, lookup, retry]);
  return {
    product: listed ?? (remote?.id === id ? remote.product : undefined),
    error: !listed && remote?.id === id ? remote.error : undefined,
    loading: lookup && remote?.id !== id,
    retry: () => { setRemote(undefined); setRetry((value) => value + 1); },
  };
}

export function studioError(error: unknown, t: TranslationDictionary['studioForms']) {
  if (!(error instanceof ApiClientError)) return t.failed;
  switch (error.code) {
    case 'DEMO_UNAVAILABLE': return t.demoUnavailable;
    case 'HANDLE_TAKEN': return t.handleTaken;
    case 'INVALID_PRODUCT':
    case 'UPLOAD_TOO_LARGE': return error.status === 413 ? t.uploadLarge : t.badMedia;
    case 'INVALID_PRICE': return t.invalidPrices;
    case 'SPLIT_VERSION_CHANGED': return t.splitVersionChanged;
    case 'INVALID_SPLITS': return t.invalidSplit;
    case 'SPLIT_LOCKED':
    case 'CHECKOUT_IN_PROGRESS': return t.splitLocked;
    case 'IDEMPOTENCY_CONFLICT': return t.replayConflict;
    case 'INVITATION_UNAVAILABLE':
    case 'TOKEN_SERVICE_UNAVAILABLE': return t.splitUnavailable;
    case 'MEDIA_NOT_FOUND': return t.mediaUnavailable;
  }
  if (error.status === 401) return t.signIn;
  if (error.status === 403) return t.forbidden;
  if (error.status === 404) return t.unavailable;
  return t.failed;
}

import { useOutletContext } from 'react-router-dom';
import { ApiClientError } from '@/types/api';
import type { ArtistSummary, CreatedProduct } from '@/types/models';
import type { TranslationDictionary } from '@/i18n/locales/en';

export interface StudioWorkspace {
  storefront: ArtistSummary | null;
  setStorefront(storefront: ArtistSummary | null): void;
  isRestoringStorefront: boolean;
  updateProfileImage(profile: ArtistSummary): void;
  products: CreatedProduct[];
  recordProduct(product: CreatedProduct): void;
}

export function useStudioWorkspace() {
  return useOutletContext<StudioWorkspace>();
}

export function studioError(error: unknown, t: TranslationDictionary['studioForms']) {
  if (!(error instanceof ApiClientError)) return t.failed;
  switch (error.code) {
    case 'INVALID_PROFILE_IMAGE': return t.badPicture;
    case 'DEMO_UNAVAILABLE': return t.demoUnavailable;
    case 'HANDLE_TAKEN': return t.handleTaken;
    case 'INVALID_PRODUCT':
    case 'UPLOAD_TOO_LARGE': return error.status === 413 ? t.uploadLarge : t.badMedia;
    case 'INVALID_PRICE': return t.invalidPrices;
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

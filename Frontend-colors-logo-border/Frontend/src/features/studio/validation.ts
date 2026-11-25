import type { PriceReplacement, ProductCreateRequest, SplitShare } from '@/types/models';
import { isValidCameroonPhone, isValidUuid, MAX_PRODUCT_DESC_LENGTH, TOTAL_SPLIT_BPS } from '@/utils/validation';

export const VIDEO_ACCEPT = '.mp4,.webm,.mov';
export const AUDIO_ACCEPT = '.mp3,.wav,.ogg,.oga,.opus,.flac,.m4a';

function validFile(file: File | undefined, extensions: string, maxMiB: number) {
  if (!file) return true;
  const extension = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase();
  return Boolean(extension && extensions.split(',').includes(extension) && file.size > 0 && file.size <= maxMiB * 1024 * 1024);
}

export function isValidProductDraft({ typeCode, videoFile, audioFile, videoPreviewFile, description }: ProductCreateRequest) {
  if ((typeCode === 'release' || typeCode === 'video') && !videoFile && !audioFile) return false;
  return (description?.length ?? 0) <= MAX_PRODUCT_DESC_LENGTH
    && validFile(videoFile, VIDEO_ACCEPT, 32)
    && validFile(videoPreviewFile, VIDEO_ACCEPT, 16)
    && validFile(audioFile, AUDIO_ACCEPT, 8);
}

function priceInteger(value: string): number | null {
  const parsed = Number(value);
  return /^\d+$/.test(value) && parsed > 0 && parsed <= 2_147_483_647 ? parsed : null;
}

export function buildPriceReplacement(xaf: string, currency: '' | 'EUR' | 'USD', cents: string): PriceReplacement | null {
  const local = priceInteger(xaf.trim());
  const diaspora = currency ? priceInteger(cents.trim()) : null;
  if (local === null || (currency && diaspora === null)) return null;
  return {
    local: { currencyCode: 'XAF', amountMinor: local },
    diaspora: currency && diaspora !== null ? { currencyCode: currency, amountMinor: diaspora } : null,
  };
}

export function isValidSplitDraft(productId: string, shares: SplitShare[], groupId?: string) {
  return isValidUuid(productId)
    && (!groupId || isValidUuid(groupId))
    && new Set(shares.map((share) => share.phone)).size === shares.length
    && shares.every(({ phone, shareBps }) => isValidCameroonPhone(phone) && Number.isInteger(shareBps) && shareBps > 0)
    && shares.reduce((total, share) => total + share.shareBps, 0) === TOTAL_SPLIT_BPS;
}

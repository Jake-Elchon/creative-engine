export const MAX_SEARCH_QUERY_LENGTH = 80;
export const MAX_FULL_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 120;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_BIO_LENGTH = 100;
export const MAX_PRODUCT_DESC_LENGTH = 120;
export const MAX_ASSET_KEY_LENGTH = 255;
export const TOTAL_SPLIT_BPS = 10_000;

/**
 * Validates and sanitizes search query according to GET /api/v1/artists contract:
 * Optional search string, 1-80 characters.
 */
export function validateSearchQuery(raw: string): {
  trimmed: string;
  isValid: boolean;
  isEmpty: boolean;
  isTooLong: boolean;
} {
  const trimmed = raw.trim();
  const isEmpty = trimmed.length === 0;
  const isTooLong = trimmed.length > MAX_SEARCH_QUERY_LENGTH;
  return {
    trimmed,
    isValid: !isTooLong,
    isEmpty,
    isTooLong,
  };
}

/**
 * Strict validation for Cameroonian phone numbers in exact +237XXXXXXXXX format.
 * Does NOT silently transform invalid numbers into valid ones.
 */
export function isValidCameroonPhone(phone: string): boolean {
  return /^\+237\d{9}$/.test(phone);
}

export function isValidOtpCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidFullName(fullName: string): boolean {
  const trimmed = fullName.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_FULL_NAME_LENGTH;
}

export function isValidXafAmountMinor(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}

export function isValidStorefrontHandle(handle: string): boolean {
  return /^[a-z0-9-]{3,30}$/.test(handle);
}

export function isValidDisplayName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_DISPLAY_NAME_LENGTH;
}

export function isValidBio(bio: string): boolean {
  return bio.trim().length <= MAX_BIO_LENGTH;
}

export function isValidProductDescription(desc: string): boolean {
  const trimmed = desc.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PRODUCT_DESC_LENGTH;
}

export function isValidAssetKey(key: string): boolean {
  return key.trim().length <= MAX_ASSET_KEY_LENGTH;
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

export function formatBpsAsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = Math.abs(bps % 100)
    .toString()
    .padStart(2, '0');
  return `${whole}.${frac}%`;
}

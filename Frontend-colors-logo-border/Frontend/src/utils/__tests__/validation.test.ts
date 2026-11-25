import { describe, expect, it } from 'vitest';
import {
  isValidCameroonPhone,
  isValidEmail,
  isValidOtpCode,
  isValidXafAmountMinor,
} from '@/utils/validation';

describe('validation utilities', () => {
  it('validates strict +237XXXXXXXXX Cameroon phone format', () => {
    expect(isValidCameroonPhone('+237677000000')).toBe(true);
    expect(isValidCameroonPhone('+237222334455')).toBe(true);

    // Must not silently accept missing +237, spaces, or wrong length
    expect(isValidCameroonPhone('677000000')).toBe(false);
    expect(isValidCameroonPhone('237677000000')).toBe(false);
    expect(isValidCameroonPhone('+237 677000000')).toBe(false);
    expect(isValidCameroonPhone('+23767700000')).toBe(false);
    expect(isValidCameroonPhone('+2376770000001')).toBe(false);
  });

  it('validates 6-digit OTP preserving leading zeroes', () => {
    expect(isValidOtpCode('012345')).toBe(true);
    expect(isValidOtpCode('000000')).toBe(true);
    expect(isValidOtpCode('12345')).toBe(false);
    expect(isValidOtpCode('12345a')).toBe(false);
  });

  it('validates email and integer XAF minor amounts', () => {
    expect(isValidEmail('amina@example.com')).toBe(true);
    expect(isValidEmail('bad-email')).toBe(false);
    expect(isValidXafAmountMinor(2500)).toBe(true);
    expect(isValidXafAmountMinor(0)).toBe(false);
    expect(isValidXafAmountMinor(12.5)).toBe(false);
  });
});

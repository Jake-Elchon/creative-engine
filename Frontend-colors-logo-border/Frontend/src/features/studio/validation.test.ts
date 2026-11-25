import { describe, expect, it } from 'vitest';
import { buildPriceReplacement, isValidProductDraft, isValidSplitDraft } from './validation';

describe('Studio API v1 input validation', () => {
  it('requires media for releases and videos and accepts eligible metadata-only products', () => {
    expect(isValidProductDraft({ typeCode: 'release' })).toBe(false);
    expect(isValidProductDraft({ typeCode: 'video', audioFile: new File(['sound'], 'audio.mp3') })).toBe(true);
    expect(isValidProductDraft({ typeCode: 'tip' })).toBe(true);
    expect(isValidProductDraft({ typeCode: 'release', videoFile: new File(['bad'], 'video.exe') })).toBe(false);
    expect(isValidProductDraft({ typeCode: 'release', audioFile: new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'audio.wav') })).toBe(false);
  });

  it('requires the original media separately from the public video preview', () => {
    const videoFile = new File(['master'], 'master.webm', { type: 'video/webm' });
    const videoPreviewFile = new File(['preview'], 'preview.webm', { type: 'video/webm' });
    expect(isValidProductDraft({ typeCode: 'video', videoPreviewFile })).toBe(false);
    expect(isValidProductDraft({ typeCode: 'video', videoFile, videoPreviewFile })).toBe(true);
    const oversized = new File([new Uint8Array(16 * 1024 * 1024 + 1)], 'preview.webm');
    expect(isValidProductDraft({ typeCode: 'video', videoFile, videoPreviewFile: oversized })).toBe(false);
  });

  it('replaces prices using positive integer francs and cents and clears a missing diaspora price', () => {
    expect(buildPriceReplacement('1000', 'EUR', '299')).toEqual({
      local: { currencyCode: 'XAF', amountMinor: 1000 },
      diaspora: { currencyCode: 'EUR', amountMinor: 299 },
    });
    expect(buildPriceReplacement('1000', '', '')?.diaspora).toBeNull();
    expect(buildPriceReplacement('2147483648', '', '')).toBeNull();
    expect(buildPriceReplacement('1000', 'USD', '1.50')).toBeNull();
  });

  it('requires unique valid recipients and exactly 10,000 positive integer basis points', () => {
    const product = '11111111-1111-1111-1111-111111111111';
    const first = { phone: '+237677000001', shareBps: 6000 };
    const second = { phone: '+237677000002', shareBps: 4000 };
    expect(isValidSplitDraft(product, [first, second])).toBe(true);
    expect(isValidSplitDraft(product, [first, { ...second, phone: first.phone }])).toBe(false);
    expect(isValidSplitDraft(product, [first, { ...second, shareBps: 3999 }])).toBe(false);
    expect(isValidSplitDraft(product, [first, { ...second, phone: '677000002' }])).toBe(false);
    expect(isValidSplitDraft(product, [{ ...first, shareBps: 6000.5 }, { ...second, shareBps: 3999.5 }])).toBe(false);
  });
});

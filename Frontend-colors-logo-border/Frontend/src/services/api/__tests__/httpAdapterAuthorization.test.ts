import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpRequest } from '@/services/api/client';
describe('HTTP API authorization handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('distinguishes backend 403 forbidden responses from 401 authentication failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 'FORBIDDEN',
              message: 'Creator access is required.',
            },
            requestId: 'req_403',
          }),
        ),
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      }),
    );

    await expect(
      httpRequest('/creator-only', { omitAuth: false }),
    ).rejects.toMatchObject({
      kind: 'FORBIDDEN',
      code: 'FORBIDDEN',
      status: 403,
    });
  });
});

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/app/providers/AuthProvider';
import { httpRequest } from '@/services/api/client';
import type { AuthSession } from '@/types/auth';

const session: AuthSession = {
  accessToken: 'expired', refreshToken: 'first-refresh',
  user: { id: 'creator', email: 'creator@example.test', fullName: 'Creator', preferredLang: 'en', registeredAt: '', phone: '+237677000000' },
  home: { status: 'ready', artists: [], nextCursor: null },
};

function response(status: number, payload: object) {
  return new Response(JSON.stringify(payload), { status });
}

describe('local session recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rotates once for simultaneous 401s and retries both requests as the original user', async () => {
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        expect(JSON.parse(String(options.body))).toEqual({ refreshToken: 'first-refresh' });
        expect(new Headers(options.headers).has('Authorization')).toBe(false);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return response(200, { data: { accessToken: 'replacement', refreshToken: 'second-refresh' }, requestId: 'rotate' });
      }
      return new Headers(options.headers).get('Authorization') === 'Bearer replacement'
        ? response(200, { data: true, requestId: 'success' })
        : response(401, { error: { code: 'UNAUTHENTICATED' }, requestId: 'expired' });
    });
    vi.stubGlobal('fetch', fetch);
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.setSession(session));

    await act(async () => {
      expect(await Promise.all([httpRequest('/storefronts'), httpRequest('/storefronts')])).toEqual([true, true]);
    });

    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1);
    expect(result.current.session?.user).toEqual(session.user);
    expect(result.current.session?.refreshToken).toBe('second-refresh');
    expect(result.current.homeSeed).toEqual(session.home);
  });

  it('clears the invalid session and opens sign-in when rotation fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401, { error: { code: 'INVALID_TOKEN' } })));
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    act(() => result.current.setSession(session));

    await act(async () => {
      await expect(httpRequest('/storefronts')).rejects.toMatchObject({ status: 401 });
    });

    expect(result.current.session).toBeNull();
    expect(result.current.isAuthModalOpen).toBe(true);
  });
});

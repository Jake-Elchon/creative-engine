import { env } from '@/config/env';
import { HttpApiAdapter } from '@/services/api/adapters/httpAdapter';
import { MockApiAdapter } from '@/services/api/adapters/mockAdapter';
import type { IApiAdapter } from '@/services/api/adapters/types';

const isStaticBuild = typeof __ZIBI_STATIC_BUILD__ !== 'undefined' && __ZIBI_STATIC_BUILD__;

// Keep demo fixtures out of static release bundles, even when a dev environment is supplied.
export const apiClient: IApiAdapter = !import.meta.env.PROD && !isStaticBuild && env.useMockApi
  ? new MockApiAdapter()
  : new HttpApiAdapter();

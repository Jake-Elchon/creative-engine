import { env } from '@/config/env';
import { HttpApiAdapter } from '@/services/api/adapters/httpAdapter';
import { MockApiAdapter } from '@/services/api/adapters/mockAdapter';
import type { IApiAdapter } from '@/services/api/adapters/types';

export const apiClient: IApiAdapter = env.useMockApi
  ? new MockApiAdapter()
  : new HttpApiAdapter();

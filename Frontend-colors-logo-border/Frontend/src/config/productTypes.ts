import { env } from '@/config/env';

export type ProductCategoryCode = 'MUSIC' | 'VIDEO' | 'EBOOK' | 'TIP' | 'SHOUTOUT';

export interface ProductTypeConfig {
  code: ProductCategoryCode;
  typeId: string | null;
}

const MOCK_TYPE_IDS: Record<ProductCategoryCode, string> = {
  MUSIC: '00000000-0000-4000-8000-000000000001',
  VIDEO: '00000000-0000-4000-8000-000000000002',
  EBOOK: '00000000-0000-4000-8000-000000000003',
  TIP: '00000000-0000-4000-8000-000000000004',
  SHOUTOUT: '00000000-0000-4000-8000-000000000005',
};

function resolveTypeId(
  envKey: string | undefined,
  code: ProductCategoryCode,
): string | null {
  const trimmed = envKey?.trim();
  if (trimmed) return trimmed;
  return env.useMockApi ? MOCK_TYPE_IDS[code] : null;
}

export const PRODUCT_TYPES: ProductTypeConfig[] = [
  { code: 'MUSIC', typeId: resolveTypeId(import.meta.env.VITE_PRODUCT_TYPE_MUSIC, 'MUSIC') },
  { code: 'VIDEO', typeId: resolveTypeId(import.meta.env.VITE_PRODUCT_TYPE_VIDEO, 'VIDEO') },
  { code: 'EBOOK', typeId: resolveTypeId(import.meta.env.VITE_PRODUCT_TYPE_EBOOK, 'EBOOK') },
  { code: 'TIP', typeId: resolveTypeId(import.meta.env.VITE_PRODUCT_TYPE_TIP, 'TIP') },
  { code: 'SHOUTOUT', typeId: resolveTypeId(import.meta.env.VITE_PRODUCT_TYPE_SHOUTOUT, 'SHOUTOUT') },
];

export const API_ENDPOINTS = {
  AUTH_OTP_REQUEST: '/auth/otp/request',
  AUTH_OTP_VERIFY: '/auth/otp/verify',
  ARTISTS_DISCOVERY: '/artists',
  STOREFRONT_PUBLIC: (handle: string) => `/storefront/${encodeURIComponent(handle)}`,
  STOREFRONTS_CREATE: '/storefronts',
  STOREFRONTS_UPDATE: (storefrontId: string) =>
    `/storefronts/${encodeURIComponent(storefrontId)}`,
  STOREFRONT_PRODUCTS_CREATE: (storefrontId: string) =>
    `/storefronts/${encodeURIComponent(storefrontId)}/products`,
  PRODUCT_PRICES_PUT: (productId: string) =>
    `/products/${encodeURIComponent(productId)}/prices`,
  CHECKOUT_INITIATE: '/checkout/initiate',
  CHECKOUT_STATUS: (transactionId: string) =>
    `/checkout/${encodeURIComponent(transactionId)}`,
  SPLIT_INVITE_DECISION: (inviteId: string) =>
    `/split-invitations/${encodeURIComponent(inviteId)}/decision`,
} as const;

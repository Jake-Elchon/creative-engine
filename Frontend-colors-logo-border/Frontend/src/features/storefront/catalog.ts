import type { StorefrontProduct } from '@/types/models';

export function checkoutAmount(product: StorefrontProduct): number | null {
  return product.prices.find((price) => price.currencyCode === 'XAF')?.amountMinor ?? null;
}

export function getDisplayPrice(product: StorefrontProduct) {
  return product.prices.find((price) => price.currencyCode === product.displayCurrency)
    ?? product.prices.find((price) => price.currencyCode === 'XAF');
}

import type { SupportedLocale } from '@/types/auth';
import type { SupportedCurrency } from '@/types/models';

export function formatMoney(
  amount: number,
  currency: SupportedCurrency = 'XAF',
  locale: SupportedLocale = 'en',
): string {
  const intlLocale = locale === 'fr' ? 'fr-CM' : 'en-CM';

  if (currency === 'XAF') {
    const formatted = new Intl.NumberFormat(intlLocale, {
      maximumFractionDigits: 0,
    }).format(amount);
    return `${formatted} FCFA`;
  }

  return new Intl.NumberFormat(intlLocale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

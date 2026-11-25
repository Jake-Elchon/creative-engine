import { en, type TranslationDictionary } from './locales/en';
import { fr } from './locales/fr';
import type { SupportedLocale } from '@/types/auth';

export const dictionaries: Record<SupportedLocale, TranslationDictionary> = {
  en,
  fr,
};

export function interpolate(
  template: string,
  values?: Record<string, string | number>,
): string {
  if (!values) return template;
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

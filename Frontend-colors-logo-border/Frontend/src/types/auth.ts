import type { ArtistSummary } from './models';

export type SupportedLocale = 'en' | 'fr';

export type OtpChannel = 'sms' | 'whatsapp';

export interface OtpRequestPayload {
  phone: string;
  channel: OtpChannel;
}

export interface OtpRequestResponse {
  expiresAt: string;
  isMockDemo?: boolean;
}

export interface OtpVerifyPayload {
  phone: string;
  code: string;
  fullName?: string;
  preferredLang?: SupportedLocale;
  email?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  fullName: string;
  preferredLang: SupportedLocale;
  registeredAt: string;
  phone: string;
}

export interface HomeSeedData {
  status: 'ready' | 'unavailable';
  artists: ArtistSummary[];
  nextCursor: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
  home: HomeSeedData;
  isMockDemo?: boolean;
}

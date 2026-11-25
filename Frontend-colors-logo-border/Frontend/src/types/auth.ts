import type { ArtistSummary } from './models';

export type SupportedLocale = 'en' | 'fr';

export interface OtpRequestPayload {
  phone: string;
  email: string;
}

export type OtpNextAction = 'login' | 'register';

export interface OtpRequestResponse {
  code: string;
  expiresAt: string;
  nextAction: OtpNextAction;
}

export interface OtpLoginPayload {
  phone: string;
  code: string;
  email?: string;
}

export interface OtpVerifyPayload extends OtpLoginPayload {
  fullName: string;
  preferredLang: SupportedLocale;
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

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession extends SessionTokens {
  user: AuthenticatedUser;
  home: HomeSeedData;
  isMockDemo?: boolean;
}

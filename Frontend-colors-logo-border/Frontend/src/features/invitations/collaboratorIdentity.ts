import { createContext, useContext } from 'react';
import type { VerifiedCollaboratorSession } from '@/services/api/adapters/types';

export type CollaboratorIdentity =
  | { status: 'unavailable' }
  | { status: 'signedOut'; signIn(): void }
  | { status: 'phoneRequired'; confirmPhone(): void }
  | { status: 'verified'; session: VerifiedCollaboratorSession };

/** An approved Supabase client can provide this independently of local OTP. */
export const CollaboratorIdentityContext = createContext<CollaboratorIdentity>({ status: 'unavailable' });

export function useCollaboratorIdentity() {
  return useContext(CollaboratorIdentityContext);
}

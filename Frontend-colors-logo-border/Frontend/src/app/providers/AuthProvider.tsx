import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setAuthTokenProvider } from '@/services/api/client';
import type { AuthSession, HomeSeedData } from '@/types/auth';

interface AuthContextValue {
  session: AuthSession | null;
  homeSeed: HomeSeedData | null;
  isInitialized: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  setSession: (session: AuthSession | null) => void;
  clearHomeSeed: () => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [homeSeed, setHomeSeed] = useState<HomeSeedData | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    setAuthTokenProvider(() => session?.accessToken ?? null);
    setIsInitialized(true);
    return () => setAuthTokenProvider(null);
  }, [session]);

  const setSession = useCallback((nextSession: AuthSession | null) => {
    setSessionState(nextSession);
    setAuthTokenProvider(() => nextSession?.accessToken ?? null);
    if (nextSession?.home) {
      setHomeSeed(nextSession.home);
    }
  }, []);

  const clearHomeSeed = useCallback(() => {
    setHomeSeed(null);
  }, []);

  const signOut = useCallback(() => {
    setSessionState(null);
    setHomeSeed(null);
    setAuthTokenProvider(null);
  }, []);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      homeSeed,
      isInitialized,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      setSession,
      clearHomeSeed,
      signOut,
    }),
    [
      session,
      homeSeed,
      isInitialized,
      isAuthModalOpen,
      openAuthModal,
      closeAuthModal,
      setSession,
      clearHomeSeed,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

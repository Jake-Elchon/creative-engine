import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { apiClient } from '@/services/api';
import { setAuthRecovery, setAuthTokenProvider } from '@/services/api/client';
import type { AuthSession, HomeSeedData } from '@/types/auth';

interface AuthContextValue {
  session: AuthSession | null;
  homeSeed: HomeSeedData | null;
  isInitialized: boolean;
  isAuthModalOpen: boolean;
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
  const activeSession = useRef<AuthSession | null>(null);
  const rotation = useRef<Promise<string | null> | null>(null);
  const rotatedTokens = useRef(new Set<string>());

  const setSession = useCallback((next: AuthSession | null) => {
    activeSession.current = next;
    rotation.current = null;
    rotatedTokens.current.clear();
    setSessionState(next);
    setIsAuthModalOpen(false);
    setHomeSeed(next?.home ?? null);
  }, []);

  const recover = useCallback((failedToken: string): Promise<string | null> => {
    const current = activeSession.current;
    if (!current) return Promise.resolve(null);
    if (current.accessToken !== failedToken) {
      return Promise.resolve(rotatedTokens.current.has(failedToken) ? current.accessToken : null);
    }
    if (rotation.current) return rotation.current;
    const pending = apiClient.refreshSession(current.refreshToken).then((tokens) => {
      if (activeSession.current !== current) return null;
      const updated = { ...current, ...tokens };
      rotatedTokens.current.add(current.accessToken);
      activeSession.current = updated;
      setSessionState(updated);
      return updated.accessToken;
    }).catch(() => {
      if (activeSession.current === current) {
        setSession(null);
        setIsAuthModalOpen(true);
      }
      return null;
    }).finally(() => {
      if (rotation.current === pending) rotation.current = null;
    });

    rotation.current = pending;
    return pending;
  }, [setSession]);

  useEffect(() => {
    setAuthTokenProvider(() => activeSession.current?.accessToken ?? null);
    setAuthRecovery(recover);
    setIsInitialized(true);
    return () => {
      setAuthTokenProvider(null);
      setAuthRecovery(null);
    };
  }, [recover]);

  const clearHomeSeed = useCallback(() => setHomeSeed(null), []);
  const signOut = useCallback(() => setSession(null), [setSession]);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const value = useMemo<AuthContextValue>(() => ({
    session, homeSeed, isInitialized, isAuthModalOpen,
    closeAuthModal, setSession, clearHomeSeed, signOut,
  }), [session, homeSeed, isInitialized, isAuthModalOpen, closeAuthModal, setSession, clearHomeSeed, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Keypair, Session } from "@synonymdev/pubky";

function safeSessionExport(session: Session): string | null {
  try {
    return session.export();
  } catch {
    return null;
  }
}

function encodeSeed(keypair: Keypair): string {
  const seed = keypair.secret();
  return btoa(String.fromCharCode(...seed));
}

interface AuthState {
  isAuthenticated: boolean;
  publicKey: string | null;
  keypair: Keypair | null;
  session: Session | null;
  sessionExport: string | null;
  seed: string | null;
  isRestoringSession: boolean;
  hasHydrated: boolean;
}

interface AuthActions {
  signin: (publicKey: string, keypair: Keypair, session: Session) => void;
  signinWithSession: (publicKey: string, session: Session) => void;
  logout: () => void;
  setIsRestoringSession: (v: boolean) => void;
  setHasHydrated: (v: boolean) => void;
}

const initialState: AuthState = {
  isAuthenticated: false,
  publicKey: null,
  keypair: null,
  session: null,
  sessionExport: null,
  seed: null,
  isRestoringSession: false,
  hasHydrated: false,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      ...initialState,

      signin: (publicKey, keypair, session) => {
        const sessionExport = safeSessionExport(session);
        const seed = encodeSeed(keypair);
        set({
          isAuthenticated: true,
          publicKey,
          keypair,
          session,
          sessionExport,
          seed,
        });
      },

      signinWithSession: (publicKey, session) => {
        const sessionExport = safeSessionExport(session);
        set({
          isAuthenticated: true,
          publicKey,
          keypair: null,
          session,
          sessionExport,
          seed: null,
        });
      },

      logout: () => {
        set({ ...initialState, hasHydrated: true });
      },

      setIsRestoringSession: (v) => set({ isRestoringSession: v }),
      setHasHydrated: (v) => set({ hasHydrated: v }),
    }),
    {
      name: "mapky-auth",
      partialize: (state) => ({
        publicKey: state.publicKey,
        sessionExport: state.sessionExport,
        seed: state.seed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
          if (state.sessionExport || state.seed) {
            state.setIsRestoringSession(true);
          }
        }
      },
    },
  ),
);

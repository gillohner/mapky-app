import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth-store";
import type { Keypair, Session } from "@synonymdev/pubky";

interface AuthContextType {
  isAuthenticated: boolean;
  publicKey: string | null;
  keypair: Keypair | null;
  session: Session | null;
  signin: (publicKey: string, keypair: Keypair, session: Session) => void;
  signinWithSession: (publicKey: string, session: Session) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const store = useAuthStore();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isRestoringSession = useAuthStore((s) => s.isRestoringSession);
  const session = useAuthStore((s) => s.session);
  const sessionExport = useAuthStore((s) => s.sessionExport);
  const seed = useAuthStore((s) => s.seed);

  useEffect(() => {
    if (!hasHydrated) return;

    // Already have a live session
    if (session) {
      if (isRestoringSession) store.setIsRestoringSession(false);
      return;
    }

    // Try restoring from seed (recovery file auth)
    if (seed && !sessionExport) {
      (async () => {
        try {
          const { Keypair } = await import("@synonymdev/pubky");
          const seedBytes = Uint8Array.from(atob(seed), (c) => c.charCodeAt(0));
          const keypair = Keypair.fromSecret(seedBytes);
          const { pubkyClient } = await import("@/lib/pubky/client");
          const restoredSession = await pubkyClient.signin(keypair);
          const publicKey = keypair.publicKey.z32();
          store.signin(publicKey, keypair, restoredSession);
        } catch (error) {
          console.warn("Failed to restore session from seed:", error);
          store.logout();
        }
      })();
      return;
    }

    // Try restoring from session export (QR auth)
    if (sessionExport) {
      (async () => {
        try {
          const { Pubky } = await import("@synonymdev/pubky");
          const { config } = await import("@/lib/config");
          const sdk =
            config.env === "testnet" ? Pubky.testnet() : new Pubky();
          const restoredSession = await Promise.race([
            sdk.restoreSession(sessionExport),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("restoreSession timeout")), 8000),
            ),
          ]);
          store.signinWithSession(
            restoredSession.info.publicKey.z32(),
            restoredSession,
          );
        } catch (error) {
          console.warn("Failed to restore session from export:", error);
          store.logout();
        }
      })();
      return;
    }

    // Nothing to restore
    if (isRestoringSession) store.setIsRestoringSession(false);
  }, [hasHydrated, session, sessionExport, seed, isRestoringSession, store]);

  if (!hasHydrated || isRestoringSession) {
    return (
      <div className="flex h-dvh items-center justify-center bg-mapky-bg dark:bg-mapky-bg-dark">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-mapky-primary border-t-transparent" />
          <p className="text-mapky-muted dark:text-mapky-muted-dark">
            {isRestoringSession ? "Restoring session..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  const value: AuthContextType = {
    isAuthenticated: store.isAuthenticated,
    publicKey: store.publicKey,
    keypair: store.keypair,
    session: store.session,
    signin: store.signin,
    signinWithSession: store.signinWithSession,
    logout: store.logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

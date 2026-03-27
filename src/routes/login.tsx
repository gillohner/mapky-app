import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PubkyClient } from "@/lib/pubky/client";
import { PubkyAuthWidget } from "@/components/auth/PubkyAuthWidget";
import { ingestUserIntoNexus } from "@/lib/nexus/ingest";
import { config, isTestnet } from "@/lib/config";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { Pubky, Keypair, PublicKey } from "@synonymdev/pubky";
import type { Session, AuthToken } from "@synonymdev/pubky";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signin, signinWithSession, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [recoveryFile, setRecoveryFile] = useState<File | null>(null);
  // QR/Pubky Ring auth doesn't work in testnet (PKARR records aren't on public DHT)
  const [authMethod, setAuthMethod] = useState<"qr" | "recovery">(
    isTestnet ? "recovery" : "qr",
  );
  const [isSigningUp, setIsSigningUp] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, navigate]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRecoveryFile(file);
      setError(null);
    }
  };

  const handleQrAuthSuccess = async (
    publicKey: string,
    session?: Session,
    _token?: AuthToken,
  ) => {
    console.log("[Login] QR auth success callback:", { publicKey, hasSession: !!session });

    if (session) {
      setIsLoading(true);
      try {
        await ingestUserIntoNexus(publicKey);
        signinWithSession(publicKey, session);
        toast.success("Signed in!");
        navigate({ to: "/" });
      } catch {
        setError("Failed to sign in with QR code.");
      } finally {
        setIsLoading(false);
      }
      return;
    }

    console.error("[Login] No session returned from QR auth");
    setError("QR authentication failed: no session received.");
  };

  const handleRecoverySignIn = async () => {
    if (!recoveryFile || !passphrase.trim()) {
      setError("Please select a recovery file and enter your passphrase");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const arrayBuffer = await recoveryFile.arrayBuffer();
      const recoveryData = new Uint8Array(arrayBuffer);
      const keypair = PubkyClient.restoreFromRecoveryFile(
        recoveryData,
        passphrase,
      );
      const publicKey = keypair.publicKey.z32();

      const client = new PubkyClient();
      const session = await client.signin(keypair);

      await ingestUserIntoNexus(publicKey);
      signin(publicKey, keypair, session);

      toast.success("Signed in!");
      navigate({ to: "/" });
    } catch {
      setError(
        "Failed to sign in. Please check your recovery file and passphrase.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestnetSignup = async () => {
    if (config.env !== "testnet") return;

    setIsSigningUp(true);
    setError(null);

    try {
      const tokenResponse = await fetch(
        "http://localhost:6288/generate_signup_token",
        { headers: { "X-Admin-Password": "admin" } },
      );

      if (!tokenResponse.ok) throw new Error("Failed to generate signup token");
      const signupToken = await tokenResponse.text();

      const keypair = Keypair.random();
      const publicKey = keypair.publicKey.z32();

      const pubky = Pubky.testnet();
      const signer = pubky.signer(keypair);
      const homeserver = PublicKey.from(config.homeserver.publicKey);
      const session = await signer.signup(homeserver, signupToken);

      await new Promise((r) => setTimeout(r, 2000));

      const defaultProfile = {
        name: `Mapky User ${publicKey.substring(0, 8)}`,
        bio: "Created via Mapky testnet",
        image: null,
        links: [],
        status: null,
      };
      await session.storage.putText(
        "/pub/pubky.app/profile.json",
        JSON.stringify(defaultProfile),
      );

      const testPassphrase = "testnet123";
      const recoveryFileData = keypair.createRecoveryFile(testPassphrase);
      const blob = new Blob([new Uint8Array(recoveryFileData)], {
        type: "application/octet-stream",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mapky-testnet-${publicKey.substring(0, 8)}.pkarr`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      await ingestUserIntoNexus(publicKey);
      signin(publicKey, keypair, session);

      toast.success(
        `Account created! Recovery file downloaded (passphrase: ${testPassphrase})`,
      );
      navigate({ to: "/" });
    } catch (err) {
      setError(
        `Failed to create testnet account: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <div className="pointer-events-auto flex h-dvh items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <button
        onClick={() => navigate({ to: "/" })}
        className="absolute right-4 top-4 rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"
      >
        <X className="h-6 w-6" />
      </button>

      <div className="w-full max-w-md">
        <h1 className="mb-2 text-center text-3xl font-bold text-foreground">
          Sign in to Mapky
        </h1>
        <p className="mb-8 text-center text-sm text-muted">
          Scan with Pubky Ring or use your recovery file
        </p>

        {!isTestnet && (
          <div className="mb-6 grid grid-cols-2 gap-2">
            {(["qr", "recovery"] as const).map((method) => (
              <button
                key={method}
                onClick={() => setAuthMethod(method)}
                className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  authMethod === method
                    ? "bg-accent text-white"
                    : "bg-surface text-muted hover:bg-border"
                }`}
              >
                {method === "qr" ? "Pubky Ring" : "Recovery File"}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-6">
          {authMethod === "qr" ? (
            <PubkyAuthWidget
              open={true}
              onSuccess={handleQrAuthSuccess}
              onError={(err) => setError(err.message)}
            />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Recovery File
                </label>
                <div
                  className="cursor-pointer rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-accent"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pkarr,.pubky"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Upload className="mx-auto mb-2 h-8 w-8 text-muted" />
                  {recoveryFile ? (
                    <p className="text-sm font-medium text-accent">
                      {recoveryFile.name}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">
                      Click to upload .pkarr file
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Passphrase
                </label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter your recovery passphrase"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
                  {error}
                </div>
              )}

              <button
                onClick={handleRecoverySignIn}
                disabled={!recoveryFile || !passphrase.trim() || isLoading}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </button>
            </div>
          )}
        </div>

        {config.env === "testnet" && (
          <div className="mt-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted">
                  Testnet Only
                </span>
              </div>
            </div>
            <button
              onClick={handleTestnetSignup}
              disabled={isSigningUp}
              className="w-full rounded-lg border border-amber-400 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              {isSigningUp ? "Creating Account..." : "Create Test Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

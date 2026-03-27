import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import * as pubky from "@synonymdev/pubky";
import { config } from "@/lib/config";
import { Copy, ExternalLink, Check } from "lucide-react";
import { toast } from "sonner";

interface PubkyAuthWidgetProps {
  relay?: string;
  caps?: string;
  open?: boolean;
  onSuccess?: (
    publicKey: string,
    session?: pubky.Session,
    token?: pubky.AuthToken,
  ) => void;
  onError?: (error: Error) => void;
}

export function PubkyAuthWidget({
  relay,
  caps = "/pub/mapky.app/:rw,/pub/pubky.app/:rw",
  open = false,
  onSuccess,
  onError,
}: PubkyAuthWidgetProps) {
  const [pubkyZ32, setPubkyZ32] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sdkRef = useRef<pubky.Pubky | null>(null);

  const handleCopyAuthUrl = useCallback(async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      toast.success("Auth link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  }, [authUrl]);

  const handleOpenInPubkyRing = useCallback(() => {
    if (!authUrl) return;
    const opened = window.open(authUrl, "_blank");
    if (!opened) window.location.href = authUrl;
  }, [authUrl]);

  const updateQr = useCallback(() => {
    if (!canvasRef.current || !authUrl) return;
    try {
      QRCode.toCanvas(canvasRef.current, authUrl, {
        margin: 2,
        width: 192,
        color: { light: "#fff", dark: "#000" },
      });
    } catch (e) {
      console.error("QR render error:", e);
      onError?.(e as Error);
    }
  }, [authUrl, onError]);

  const generateFlow = useCallback(async () => {
    if (!sdkRef.current) return;

    setPubkyZ32("");
    setAuthUrl("");

    try {
      const relayUrl = relay || config.relay.url;
      console.log("[PubkyAuth] Starting auth flow with relay:", relayUrl, "caps:", caps);

      const flowKind = pubky.AuthFlowKind.signin();
      const flow = sdkRef.current.startAuthFlow(
        caps as pubky.Capabilities,
        flowKind,
        relayUrl,
      );

      const url = flow.authorizationUrl;
      console.log("[PubkyAuth] Auth URL generated:", url);
      setAuthUrl(url);

      setTimeout(() => {
        updateQr();
        requestAnimationFrame(() => updateQr());
      }, 50);

      if (caps && caps.trim().length > 0) {
        console.log("[PubkyAuth] Awaiting approval (session)...");
        const session = await flow.awaitApproval();
        const publicKey = session.info.publicKey.z32();
        console.log("[PubkyAuth] Approval received! publicKey:", publicKey);
        setPubkyZ32(publicKey);
        onSuccess?.(publicKey, session);
      } else {
        console.log("[PubkyAuth] Awaiting token...");
        const token = await flow.awaitToken();
        const publicKey = token.publicKey.z32();
        console.log("[PubkyAuth] Token received! publicKey:", publicKey);
        setPubkyZ32(publicKey);
        onSuccess?.(publicKey, undefined, token);
      }
    } catch (error) {
      console.error("[PubkyAuth] Auth flow failed:", error);
      onError?.(error as Error);
    }
  }, [relay, caps, onSuccess, onError, updateQr]);

  useEffect(() => {
    sdkRef.current =
      config.env === "testnet" ? pubky.Pubky.testnet() : new pubky.Pubky();
    console.log("[PubkyAuth] SDK initialized, env:", config.env);
  }, []);

  useEffect(() => {
    if (open && !authUrl && sdkRef.current) {
      const timer = setTimeout(() => {
        generateFlow();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, authUrl, generateFlow]);

  useEffect(() => {
    updateQr();
  }, [updateQr]);

  const showSuccess = Boolean(pubkyZ32);

  return (
    <div className="flex flex-col items-center">
      <p className="mb-4 text-center text-sm text-muted">
        {showSuccess ? "Authorized" : "Scan with Pubky Ring"}
      </p>

      {showSuccess ? (
        <div className="text-center">
          <p className="break-all font-mono text-xs text-foreground">
            {pubkyZ32}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl bg-white p-4">
            <canvas ref={canvasRef} className="h-48 w-48" />
          </div>

          {authUrl && (
            <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
              <button
                onClick={handleCopyAuthUrl}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-border"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? "Copied!" : "Copy Auth Link"}
              </button>
              <button
                onClick={handleOpenInPubkyRing}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                <ExternalLink className="h-4 w-4" />
                Open in Pubky Ring
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
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
  const [authUrl, setAuthUrl] = useState("");
  const [pubkyZ32, setPubkyZ32] = useState("");
  const [copied, setCopied] = useState(false);
  const sdkRef = useRef<pubky.Pubky | null>(null);

  const handleCopy = useCallback(async () => {
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

  const handleOpenInRing = useCallback(() => {
    if (!authUrl) return;
    const opened = window.open(authUrl, "_blank");
    if (!opened) window.location.href = authUrl;
  }, [authUrl]);

  const generateFlow = useCallback(async () => {
    if (!sdkRef.current) return;
    setPubkyZ32("");
    setAuthUrl("");

    try {
      const relayUrl = relay || config.relay.url;
      const flowKind = pubky.AuthFlowKind.signin();
      const flow = sdkRef.current.startAuthFlow(
        caps as pubky.Capabilities,
        flowKind,
        relayUrl,
      );
      setAuthUrl(flow.authorizationUrl);

      if (caps && caps.trim().length > 0) {
        const session = await flow.awaitApproval();
        const publicKey = session.info.publicKey.z32();
        setPubkyZ32(publicKey);
        onSuccess?.(publicKey, session);
      } else {
        const token = await flow.awaitToken();
        const publicKey = token.publicKey.z32();
        setPubkyZ32(publicKey);
        onSuccess?.(publicKey, undefined, token);
      }
    } catch (error) {
      console.error("Auth flow failed:", error);
      onError?.(error as Error);
    }
  }, [relay, caps, onSuccess, onError]);

  useEffect(() => {
    sdkRef.current =
      config.env === "testnet" ? pubky.Pubky.testnet() : new pubky.Pubky();
  }, []);

  useEffect(() => {
    if (open && !authUrl && sdkRef.current) {
      const timer = setTimeout(generateFlow, 100);
      return () => clearTimeout(timer);
    }
  }, [open, authUrl, generateFlow]);

  if (pubkyZ32) {
    return (
      <div className="text-center">
        <p className="mb-2 text-sm text-mapky-muted dark:text-mapky-muted-dark">
          Authorized:
        </p>
        <p className="break-all font-mono text-xs">{pubkyZ32}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <p className="mb-4 text-center text-sm text-mapky-muted dark:text-mapky-muted-dark">
        Scan with Pubky Ring
      </p>

      {authUrl ? (
        <>
          <div className="rounded-2xl bg-white p-4">
            <QRCodeSVG value={authUrl} size={192} />
          </div>

          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            <button
              onClick={handleCopy}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-mapky-border bg-mapky-surface px-4 py-2.5 text-sm font-medium text-mapky-text transition-colors hover:bg-mapky-border dark:border-mapky-border-dark dark:bg-mapky-surface-dark dark:text-mapky-text-dark dark:hover:bg-mapky-border-dark"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy Auth Link"}
            </button>
            <button
              onClick={handleOpenInRing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-mapky-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-mapky-primary/90 dark:bg-mapky-primary-dark dark:hover:bg-mapky-primary-dark/90"
            >
              <ExternalLink className="h-4 w-4" />
              Open in Pubky Ring
            </button>
          </div>
        </>
      ) : (
        <div className="flex h-48 w-48 items-center justify-center rounded-2xl bg-mapky-surface dark:bg-mapky-surface-dark">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-mapky-primary border-t-transparent" />
        </div>
      )}
    </div>
  );
}

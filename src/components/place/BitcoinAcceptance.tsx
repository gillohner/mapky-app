import { Bitcoin, Zap, Wifi } from "lucide-react";
import { useOsmLookup } from "@/lib/api/hooks";
import { readBitcoinAcceptance } from "@/lib/btcmap/overpass";

interface Props {
  osmType: string;
  osmId: number;
}

/**
 * Renders a row of payment-method pills when this OSM POI accepts
 * Bitcoin. Reads from Nominatim's `extratags` (`currency:XBT` /
 * `payment:*`), which the nexus plugin pre-seeds in Redis from the
 * BTCMap dump during sync — so the lookup is an instant cache hit
 * for any BTC-accepting place. Hidden when extratags don't confirm.
 */
export function BitcoinAcceptance({ osmType, osmId }: Props) {
  const { data: nominatim } = useOsmLookup(osmType, osmId, true);
  const acceptance = readBitcoinAcceptance(nominatim?.extratags);
  if (!acceptance) return null;

  const { onchain, lightning, lightningContactless } = acceptance;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
        <Bitcoin className="h-3 w-3" aria-hidden />
        Bitcoin accepted
      </span>
      {onchain && (
        <Pill label="On-chain" icon={<Bitcoin className="h-3 w-3" />} />
      )}
      {lightning && (
        <Pill label="Lightning" icon={<Zap className="h-3 w-3" />} />
      )}
      {lightningContactless && (
        <Pill label="Contactless" icon={<Wifi className="h-3 w-3" />} />
      )}
    </div>
  );
}

function Pill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-foreground">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

import { useMemo } from "react";
import { Bitcoin, Zap, Wifi } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useOsmLookup } from "@/lib/api/hooks";
import {
  readBitcoinAcceptance,
  type BitcoinAcceptanceFlags,
  type BitcoinPoi,
} from "@/lib/btcmap/overpass";

interface Props {
  osmType: string;
  osmId: number;
}

/**
 * Renders a row of payment-method pills when this OSM POI accepts
 * Bitcoin. Two sources, in order:
 *
 *   1. Nominatim's `extratags` (`currency:XBT` / `payment:*`) — works
 *      when Nominatim's index has caught up with OSM (usually fine
 *      for places that have been around).
 *
 *   2. Overpass viewport cache from `useViewportBitcoinPois` — covers
 *      newly-added Bitcoin tags that Nominatim's data dump hasn't
 *      ingested yet. The user clicked the orange marker on the map,
 *      so the POI is already in the cache by definition.
 *
 * Hidden when neither source confirms Bitcoin acceptance.
 */
export function BitcoinAcceptance({ osmType, osmId }: Props) {
  const { data: nominatim } = useOsmLookup(osmType, osmId, true);
  const cachedOverpass = useCachedBitcoinFlags(osmType, osmId);

  const acceptance =
    readBitcoinAcceptance(nominatim?.extratags) ?? cachedOverpass;
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

/**
 * Search every cached `useViewportBitcoinPois` result for a matching
 * OSM key. The user almost certainly arrived here by clicking the
 * orange marker, which means the place is in at least one of those
 * cached responses. Acts as a Nominatim-extratags backstop for
 * recently-added `currency:XBT` tags.
 */
function useCachedBitcoinFlags(
  osmType: string,
  osmId: number,
): BitcoinAcceptanceFlags | null {
  const qc = useQueryClient();
  return useMemo(() => {
    const queries = qc.getQueryCache().findAll({
      queryKey: ["btcmap", "overpass"],
    });
    for (const q of queries) {
      const data = q.state.data as BitcoinPoi[] | undefined;
      if (!data) continue;
      const match = data.find(
        (b) => b.osmType === osmType && b.osmId === osmId,
      );
      if (match) {
        return {
          any: true,
          onchain: match.onchain,
          lightning: match.lightning,
          lightningContactless: match.lightningContactless,
        };
      }
    }
    return null;
    // qc is stable; only refresh when the place identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [osmType, osmId]);
}

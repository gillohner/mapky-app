/**
 * BTCMap-style Bitcoin acceptance helpers.
 *
 * The bbox/viewport BTC fetch used to live here, but BTCMap data is
 * now ingested into the nexus :Place graph and surfaces via the
 * regular `/v0/mapky/viewport` envelope (with `accepts_bitcoin` on
 * each place). The only thing left in this module is the tag-reading
 * helper used by `BitcoinAcceptance` to decode payment-method flags
 * off a Nominatim `extratags` map.
 */

/** Decoded payment-method flags. `any` is the umbrella signal — true
 * when at least one of `currency:XBT` / `payment:bitcoin` is set. */
export interface BitcoinAcceptanceFlags {
  any: boolean;
  onchain: boolean;
  lightning: boolean;
  lightningContactless: boolean;
}

/**
 * Read the BTCMap-style payment-type flags off a raw OSM tag map (e.g.
 * Nominatim's `extratags=1` response, or the BTCMap-pre-seeded entry
 * the plugin caches in Redis). Returns null when the location doesn't
 * accept Bitcoin at all so the place card can hide the badge row
 * entirely.
 */
export function readBitcoinAcceptance(
  tags: Record<string, string> | undefined,
): BitcoinAcceptanceFlags | null {
  if (!tags) return null;
  const xbt = tags["currency:XBT"] === "yes";
  const legacy = tags["payment:bitcoin"] === "yes";
  if (!xbt && !legacy) return null;

  return {
    any: true,
    onchain: tags["payment:onchain"] === "yes" || legacy,
    lightning: tags["payment:lightning"] === "yes",
    lightningContactless: tags["payment:lightning_contactless"] === "yes",
  };
}

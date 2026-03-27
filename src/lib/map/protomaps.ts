import { Protocol } from "pmtiles";
import maplibregl from "maplibre-gl";

let protocolAdded = false;

// Register PMTiles protocol for self-hosted .pmtiles files.
// Not needed when using Protomaps hosted API styles, but kept
// for future offline/self-hosted tile support.
export function addProtomapsProtocol() {
  if (protocolAdded) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolAdded = true;
}

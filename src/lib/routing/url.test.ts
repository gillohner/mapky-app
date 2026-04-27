import { describe, expect, it } from "vitest";
import {
  buildDirectionsSearch,
  parseDirectionsSearch,
  parseSlotParam,
  slotToParam,
} from "./url";
import type { WaypointSlot } from "@/stores/route-creation-store";

describe("slot URL encoding", () => {
  it("empty → null (omitted from URL)", () => {
    expect(slotToParam({ kind: "empty", id: "x" })).toBeNull();
  });

  it("coords → lat,lon (6 decimals)", () => {
    const s: WaypointSlot = {
      kind: "coords",
      id: "x",
      lat: 47.376912345,
      lon: 8.541712345,
      label: "...",
    };
    expect(slotToParam(s)).toBe("47.376912,8.541712");
  });

  it("place → lat,lon@osmType:osmId", () => {
    const s: WaypointSlot = {
      kind: "place",
      id: "x",
      lat: 47.3,
      lon: 8.5,
      label: "Central",
      osmType: "way",
      osmId: 135207248,
    };
    expect(slotToParam(s)).toBe("47.300000,8.500000@way:135207248");
  });

  it("gps → concrete lat,lon (no special token)", () => {
    const s: WaypointSlot = {
      kind: "gps",
      id: "x",
      lat: 47.3,
      lon: 8.5,
      label: "Your location",
    };
    expect(slotToParam(s)).toBe("47.300000,8.500000");
  });
});

describe("slot URL decoding", () => {
  it("'gps' → empty (re-resolved at runtime by the UI)", () => {
    expect(parseSlotParam("gps").kind).toBe("empty");
  });

  it("plain lat,lon → coords", () => {
    const s = parseSlotParam("47.3769,8.5417");
    expect(s.kind).toBe("coords");
    if (s.kind === "coords") {
      expect(s.lat).toBeCloseTo(47.3769, 4);
      expect(s.lon).toBeCloseTo(8.5417, 4);
    }
  });

  it("lat,lon@type:id → place", () => {
    const s = parseSlotParam("47.3,8.5@way:135207248");
    expect(s.kind).toBe("place");
    if (s.kind === "place") {
      expect(s.osmType).toBe("way");
      expect(s.osmId).toBe(135207248);
    }
  });

  it("garbage → empty", () => {
    expect(parseSlotParam("not-a-coord").kind).toBe("empty");
  });
});

describe("directions search roundtrip", () => {
  it("From + To + mode roundtrips identically", () => {
    const slots: WaypointSlot[] = [
      {
        kind: "coords",
        id: "a",
        lat: 47.3,
        lon: 8.5,
        label: "...",
      },
      {
        kind: "place",
        id: "b",
        lat: 47.4,
        lon: 8.6,
        label: "Top",
        osmType: "node",
        osmId: 42,
      },
    ];
    const search = buildDirectionsSearch(slots, "cycling");
    expect(search.mode).toBe("cycling");
    expect(search.from).toBe("47.300000,8.500000");
    expect(search.to).toBe("47.400000,8.600000@node:42");
    expect(search.via).toBeUndefined();

    const parsed = parseDirectionsSearch(search);
    expect(parsed.activity).toBe("cycling");
    expect(parsed.slots).toHaveLength(2);
    expect(parsed.slots[0].kind).toBe("coords");
    expect(parsed.slots[1].kind).toBe("place");
  });

  it("vias preserved in order", () => {
    const slots: WaypointSlot[] = [
      { kind: "coords", id: "a", lat: 47, lon: 8, label: "" },
      { kind: "coords", id: "b", lat: 47.1, lon: 8.1, label: "" },
      { kind: "coords", id: "c", lat: 47.2, lon: 8.2, label: "" },
      { kind: "coords", id: "d", lat: 47.3, lon: 8.3, label: "" },
    ];
    const search = buildDirectionsSearch(slots, "walking");
    expect(search.via).toEqual([
      "47.100000,8.100000",
      "47.200000,8.200000",
    ]);
    const parsed = parseDirectionsSearch(search);
    expect(parsed.slots).toHaveLength(4);
  });

  it("missing endpoints become empty slots", () => {
    const parsed = parseDirectionsSearch({ mode: "walking" });
    expect(parsed.slots).toHaveLength(2);
    expect(parsed.slots[0].kind).toBe("empty");
    expect(parsed.slots[1].kind).toBe("empty");
  });
});

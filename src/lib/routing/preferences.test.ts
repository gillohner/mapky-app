import { describe, expect, it } from "vitest";
import {
  buildCostingOptions,
  effectivePreferences,
  emptyPreferences,
  friendlyValhallaError,
  parseValhallaError,
} from "./preferences";

describe("effectivePreferences", () => {
  it("foot defaults: ferries off, tolls/highways off (irrelevant)", () => {
    expect(effectivePreferences("pedestrian", emptyPreferences())).toEqual({
      avoidFerries: true,
      avoidTolls: false,
      avoidHighways: false,
    });
  });

  it("bike defaults: tolls + highways avoided, ferries allowed", () => {
    expect(effectivePreferences("bicycle", emptyPreferences())).toEqual({
      avoidFerries: false,
      avoidTolls: true,
      avoidHighways: true,
    });
  });

  it("car defaults: nothing avoided", () => {
    expect(effectivePreferences("auto", emptyPreferences())).toEqual({
      avoidFerries: false,
      avoidTolls: false,
      avoidHighways: false,
    });
  });

  it("user override beats default", () => {
    const prefs = { ...emptyPreferences(), avoidFerries: false };
    expect(effectivePreferences("pedestrian", prefs).avoidFerries).toBe(false);
  });
});

describe("buildCostingOptions", () => {
  it("emits use_ferry=0 when foot avoids ferries", () => {
    const opts = buildCostingOptions("pedestrian", emptyPreferences());
    expect(opts.use_ferry).toBe(0);
    // Pedestrian has no toll/highway weight.
    expect(opts.use_tolls).toBeUndefined();
    expect(opts.use_highways).toBeUndefined();
  });

  it("emits use_tolls=0 when bike avoids tolls (default)", () => {
    const opts = buildCostingOptions("bicycle", emptyPreferences());
    expect(opts.use_tolls).toBe(0);
    expect(opts.use_highways).toBe(0);
    expect(opts.use_ferry).toBe(0.5);
  });

  it("driver allowed all by default", () => {
    const opts = buildCostingOptions("auto", emptyPreferences());
    expect(opts.use_ferry).toBe(0.5);
    expect(opts.use_tolls).toBe(0.5);
    expect(opts.use_highways).toBe(1);
  });
});

describe("parseValhallaError", () => {
  it("extracts code + error from typical 4xx body", () => {
    const body = JSON.stringify({
      error_code: 154,
      error: "Path distance exceeds the max distance limit: 200000 meters",
      status_code: 400,
      status: "Bad Request",
    });
    expect(parseValhallaError(body)).toMatchObject({
      code: 154,
      error: expect.stringContaining("max distance"),
    });
  });

  it("returns null for non-JSON bodies", () => {
    expect(parseValhallaError("Server Error")).toBeNull();
  });
});

describe("friendlyValhallaError", () => {
  it("154 → human-readable message + per-mode hint", () => {
    const r = friendlyValhallaError(154, "pedestrian", "");
    expect(r.message).toMatch(/too long/i);
    expect(r.hint).toMatch(/walking|hiking|200/i);
  });

  it("171 → 'no road found'", () => {
    expect(friendlyValhallaError(171, "auto", "").message).toMatch(/no road/i);
  });

  it("unknown code → generic with possibly extracted error string", () => {
    const r = friendlyValhallaError(
      999,
      "auto",
      '{"error":"weird thing happened","error_code":999}',
    );
    expect(r.message).toBe("Routing failed.");
  });
});

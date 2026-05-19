import { describe, expect, it } from "vitest";
import { RouteActivityType } from "mapky-app-specs";
import {
  costingForActivity,
  profileForActivity,
} from "./activity-costing";

describe("costingForActivity", () => {
  it("foot variants → pedestrian", () => {
    expect(costingForActivity(RouteActivityType.Hiking)).toBe("pedestrian");
    expect(costingForActivity(RouteActivityType.Walking)).toBe("pedestrian");
    expect(costingForActivity(RouteActivityType.Running)).toBe("pedestrian");
    expect(costingForActivity(RouteActivityType.Skiing)).toBe("pedestrian");
    expect(costingForActivity(RouteActivityType.Other)).toBe("pedestrian");
  });

  it("cycling → bicycle, driving → auto", () => {
    expect(costingForActivity(RouteActivityType.Cycling)).toBe("bicycle");
    expect(costingForActivity(RouteActivityType.Driving)).toBe("auto");
  });
});

describe("profileForActivity — foot mode differentiation", () => {
  it("Walk uses default speed and easy paths only", () => {
    const p = profileForActivity(RouteActivityType.Walking);
    expect(p.costing).toBe("pedestrian");
    expect(p.options?.walking_speed).toBe(5);
    expect(p.options?.max_hiking_difficulty).toBe(1);
  });

  it("Run uses higher speed (different ETA) but same easy paths", () => {
    const p = profileForActivity(RouteActivityType.Running);
    expect(p.costing).toBe("pedestrian");
    expect(p.options?.walking_speed).toBe(10);
    expect(p.options?.max_hiking_difficulty).toBe(1);
  });

  it("Hike allows expert alpine trails and prefers footpaths", () => {
    const p = profileForActivity(RouteActivityType.Hiking);
    expect(p.costing).toBe("pedestrian");
    expect(p.options?.max_hiking_difficulty).toBe(6);
    expect(p.options?.walkway_factor).toBe(0.7);
    // Walk and Hike share baseline speed; the path model differs.
    expect(p.options?.walking_speed).toBe(5);
  });

  it("Walk vs Hike differ in trail tolerance (same costing, different options)", () => {
    const w = profileForActivity(RouteActivityType.Walking);
    const h = profileForActivity(RouteActivityType.Hiking);
    expect(w.costing).toBe(h.costing);
    expect(w.options?.max_hiking_difficulty).not.toBe(
      h.options?.max_hiking_difficulty,
    );
  });

  it("Walk vs Run differ in walking_speed", () => {
    const w = profileForActivity(RouteActivityType.Walking);
    const r = profileForActivity(RouteActivityType.Running);
    expect(w.options?.walking_speed).not.toBe(r.options?.walking_speed);
  });
});

describe("profileForActivity — non-foot modes", () => {
  it("Cycling → bicycle costing, no overrides", () => {
    const p = profileForActivity(RouteActivityType.Cycling);
    expect(p.costing).toBe("bicycle");
    expect(p.options).toBeUndefined();
  });

  it("Driving → auto costing, no overrides", () => {
    const p = profileForActivity(RouteActivityType.Driving);
    expect(p.costing).toBe("auto");
    expect(p.options).toBeUndefined();
  });
});

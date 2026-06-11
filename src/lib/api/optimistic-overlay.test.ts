import { describe, it, expect, beforeEach } from "vitest";
import {
  applyPending,
  registerPending,
  clearPending,
  pendingListAdd,
  pendingListRemove,
  pendingEntityFieldPatch,
  __resetPendingForTests,
} from "./optimistic-overlay";

beforeEach(() => __resetPendingForTests());

describe("optimistic-overlay", () => {
  it("returns data unchanged when no ops registered", () => {
    expect(applyPending(["k"], [{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  it("applies a list-add overlay onto stale server data", () => {
    pendingListAdd({
      queryKey: ["tags"],
      opId: "add:vegan",
      item: { label: "vegan", count: 1 },
      getId: (t) => t.label,
    });
    const server = [{ label: "coffee", count: 3 }];
    expect(applyPending(["tags"], server)).toEqual([
      { label: "coffee", count: 3 },
      { label: "vegan", count: 1 },
    ]);
  });

  it("drops a list-add op once the server response includes it", () => {
    pendingListAdd({
      queryKey: ["tags"],
      opId: "add:vegan",
      item: { label: "vegan", count: 1 },
      getId: (t) => t.label,
    });
    // First refetch returns it — should retire the op.
    const server = [{ label: "vegan", count: 1 }];
    expect(applyPending(["tags"], server)).toEqual(server);
    // Subsequent stale-cache reads no longer carry the ghost.
    expect(applyPending(["tags"], [])).toEqual([]);
  });

  it("survives a stale refetch after a second add (issue #7 scenario)", () => {
    // User adds A, then B. The first invalidate races nexus indexing
    // and the refetch returns only A.
    pendingListAdd({
      queryKey: ["tags"],
      opId: "add:A",
      item: { label: "A", count: 1 },
      getId: (t) => t.label,
    });
    pendingListAdd({
      queryKey: ["tags"],
      opId: "add:B",
      item: { label: "B", count: 1 },
      getId: (t) => t.label,
    });
    // Stale refetch — only A indexed.
    const merged1 = applyPending(["tags"], [{ label: "A", count: 1 }]);
    expect(merged1.map((t) => t.label).sort()).toEqual(["A", "B"]);
    // Later refetch with both indexed — overlays retire, nothing duplicated.
    const merged2 = applyPending(["tags"], [
      { label: "A", count: 1 },
      { label: "B", count: 1 },
    ]);
    expect(merged2.map((t) => t.label).sort()).toEqual(["A", "B"]);
  });

  it("tombstones a removed entry until the server agrees", () => {
    pendingListRemove({
      queryKey: ["tags"],
      opId: "rm:vegan",
      itemId: "vegan",
      getId: (t: { label: string }) => t.label,
    });
    expect(
      applyPending(["tags"], [
        { label: "vegan" },
        { label: "coffee" },
      ]),
    ).toEqual([{ label: "coffee" }]);
    // Server eventually drops it — tombstone retires.
    expect(applyPending(["tags"], [{ label: "coffee" }])).toEqual([
      { label: "coffee" },
    ]);
  });

  it("patches an entity field across stale refetches", () => {
    pendingEntityFieldPatch({
      queryKey: ["entities"],
      opId: "labels:e1",
      entityId: "e1",
      getEntityId: (e: { id: string; labels: string[] }) => e.id,
      field: "labels",
      value: ["alpha", "beta"],
      matches: (cur, exp) => JSON.stringify(cur) === JSON.stringify(exp),
    });
    // Stale refetch — server's labels lag behind.
    expect(
      applyPending(["entities"], [
        { id: "e1", labels: ["alpha"] },
        { id: "e2", labels: [] },
      ]),
    ).toEqual([
      { id: "e1", labels: ["alpha", "beta"] },
      { id: "e2", labels: [] },
    ]);
    // Confirmed refetch — overlay retires.
    expect(
      applyPending(["entities"], [
        { id: "e1", labels: ["alpha", "beta"] },
        { id: "e2", labels: [] },
      ]),
    ).toEqual([
      { id: "e1", labels: ["alpha", "beta"] },
      { id: "e2", labels: [] },
    ]);
  });

  it("expires ops past TTL even if server never confirms", () => {
    registerPending(["k"], {
      id: "ghost",
      apply: () => "GHOST" as unknown,
      isConfirmed: () => false,
      ttlMs: -1, // already expired
    });
    expect(applyPending(["k"], "real")).toEqual("real");
  });

  it("clearPending removes an op explicitly", () => {
    pendingListAdd({
      queryKey: ["tags"],
      opId: "add:vegan",
      item: { label: "vegan" },
      getId: (t) => t.label,
    });
    clearPending(["tags"], "add:vegan");
    expect(applyPending(["tags"], [])).toEqual([]);
  });
});

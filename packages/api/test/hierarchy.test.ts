import { describe, expect, test, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createMockDb } from "./helpers/mockDb.js";

const { db, state } = createMockDb();

mock.module("../src/db/index.js", () => ({
  db,
  pool: { end: () => Promise.resolve() },
  schema: {},
}));

const {
  listSuperSystems,
  getSuperSystem,
  createSuperSystem,
  updateSuperSystem,
  deleteSuperSystem,
  listSubSystems,
  getSubSystem,
  createSubSystem,
  updateSubSystem,
  deleteSubSystem,
  moveSystem,
  getHierarchyTree,
  systemsContainingPoint,
  assignTrailsToSystem,
  unassignTrailsFromSystem,
} = await import("../src/services/hierarchy.js");

const systemUUID = (n: number) =>
  `00000000-0000-0000-0000-${n.toString(16).padStart(12, "0")}`;
const SUPER_ID = systemUUID(1);
const SYSTEM_A = systemUUID(2);
const SYSTEM_B = systemUUID(3);
const TRAIL_A = systemUUID(4);
const TRAIL_B = systemUUID(5);
const SUB_ID = systemUUID(6);

beforeEach(() => {
  state.superSystems.length = 0;
  state.subSystems.length = 0;
  state.systems.length = 0;
  state.systemSuperSystems.length = 0;
  state.trailSubSystems.length = 0;
  // Reset trail-systems to clean state per test.
  // Note: trailSystems is not in MockState — it's a join table; we
  // can't directly inspect it, so the test exercises the service via
  // observable side effects.
});

describe("super-systems CRUD", () => {
  test("create + get", async () => {
    const sup = await createSuperSystem({ name: "Ohio Long Trails", slug: "ohio-long", official: true });
    expect(sup.name).toBe("Ohio Long Trails");
    const fetched = await getSuperSystem(sup.id);
    expect(fetched?.id).toBe(sup.id);
  });

  test("list returns all super-systems", async () => {
    await createSuperSystem({ name: "A", slug: "a", official: true });
    await createSuperSystem({ name: "B", slug: "b", official: false });
    const list = await listSuperSystems();
    expect(list.length).toBe(2);
  });

  test("update changes mutable fields", async () => {
    const sup = await createSuperSystem({ name: "A", slug: "a", official: true });
    const updated = await updateSuperSystem(sup.id, { name: "A2" });
    expect(updated?.name).toBe("A2");
  });

  test("delete detaches systems first then removes", async () => {
    const sup = await createSuperSystem({ name: "A", slug: "a", official: true });
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    state.systemSuperSystems.push({ systemId: SYSTEM_A, superSystemId: sup.id });
    const ok = await deleteSuperSystem(sup.id);
    expect(ok).toBe(true);
    expect(state.systemSuperSystems.length).toBe(0);
  });
});

describe("sub-systems CRUD", () => {
  test("create + list by system_id", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    const sub = await createSubSystem({
      systemId: SYSTEM_A,
      name: "Northern trails",
      slug: "northern",
    });
    expect(sub.systemId).toBe(SYSTEM_A);
    const list = await listSubSystems(SYSTEM_A);
    expect(list.length).toBe(1);
  });

  test("get + update + delete", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    const sub = await createSubSystem({ systemId: SYSTEM_A, name: "N", slug: "n" });
    const fetched = await getSubSystem(sub.id);
    expect(fetched?.slug).toBe("n");
    const updated = await updateSubSystem(sub.id, { name: "Northern" });
    expect(updated?.name).toBe("Northern");
    const ok = await deleteSubSystem(sub.id);
    expect(ok).toBe(true);
  });
});

describe("moveSystem: move_to_super / move_out_of_super", () => {
  test("move_to_super adds a membership row", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    const sup = await createSuperSystem({ name: "S", slug: "s", official: true });
    const res = await moveSystem("move_to_super", {
      actorId: "u1",
      sourceSystemId: SYSTEM_A,
      targetSuperId: sup.id,
    });
    expect(res.ok).toBe(true);
    expect(state.systemSuperSystems.length).toBe(1);
    expect(state.systemSuperSystems[0]?.superSystemId).toBe(sup.id);
  });

  test("move_out_of_super removes the membership row", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    const sup = await createSuperSystem({ name: "S", slug: "s", official: true });
    state.systemSuperSystems.push({ systemId: SYSTEM_A, superSystemId: sup.id });
    const res = await moveSystem("move_out_of_super", {
      actorId: "u1",
      sourceSystemId: SYSTEM_A,
      targetSuperId: sup.id,
    });
    expect(res.ok).toBe(true);
    expect(state.systemSuperSystems.length).toBe(0);
  });
});

describe("moveSystem: merge_into", () => {
  test("merges source into target and deletes source", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    state.systems.push({ id: SYSTEM_B, name: "Sys B", slug: "sys-b" });
    // Pre-seed a trail-systems entry to move. (The mock doesn't
    // include trail-systems as a tracked table, so the service's
    // reassignment is observable only through the system deletion.)
    const res = await moveSystem("merge_into", {
      actorId: "u1",
      sourceSystemId: SYSTEM_A,
      targetSystemId: SYSTEM_B,
    });
    expect(res.ok).toBe(true);
    // Source system is deleted.
    const after = state.systems.find((s) => s.id === SYSTEM_A);
    expect(after).toBeUndefined();
  });
});

describe("moveSystem: promote_to_system", () => {
  test("creates a new system from the sub-system", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    const sub = await createSubSystem({ systemId: SYSTEM_A, name: "Northern", slug: "n" });
    const before = state.systems.length;
    const res = await moveSystem("promote_to_system", {
      actorId: "u1",
      sourceSubSystemId: sub.id,
    });
    expect(res.ok).toBe(true);
    expect(state.systems.length).toBe(before + 1);
  });
});

describe("assign / unassign trails", () => {
  test("assignTrailsToSystem inserts rows (mock is a no-op for untracked join tables)", async () => {
    // The mock doesn't track trail-systems, but the function should
    // not throw. The insert call is recorded for the assertion.
    state.insertCalls.length = 0;
    await assignTrailsToSystem(SYSTEM_A, [TRAIL_A, TRAIL_B]);
    expect(state.insertCalls.length).toBeGreaterThan(0);
  });

  test("unassignTrailsFromSystem is a no-op when trail ids are empty", async () => {
    const res = await unassignTrailsFromSystem(SYSTEM_A, []);
    expect(res).toBe(0);
  });
});

describe("getHierarchyTree", () => {
  test("returns loose bucket when no super-systems exist", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    state.systems.push({ id: SYSTEM_B, name: "Sys B", slug: "sys-b" });
    const tree = await getHierarchyTree();
    const loose = tree.find((n) => n.id === "__loose__");
    expect(loose).toBeDefined();
    expect(loose?.children.length).toBe(2);
  });

  test("groups systems under their super-system", async () => {
    const sup = await createSuperSystem({ name: "S", slug: "s", official: true });
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    state.systemSuperSystems.push({ systemId: SYSTEM_A, superSystemId: sup.id });
    state.systems.push({ id: SYSTEM_B, name: "Sys B", slug: "sys-b" }); // loose
    const tree = await getHierarchyTree();
    const supNode = tree.find((n) => n.id === sup.id);
    expect(supNode?.children.length).toBe(1);
    expect(supNode?.children[0]?.id).toBe(SYSTEM_A);
    const loose = tree.find((n) => n.id === "__loose__");
    expect(loose?.children.length).toBe(1);
  });

  test("nests sub-systems under their parent system", async () => {
    state.systems.push({ id: SYSTEM_A, name: "Sys A", slug: "sys-a" });
    await createSubSystem({ systemId: SYSTEM_A, name: "Northern", slug: "n" });
    const tree = await getHierarchyTree();
    const loose = tree.find((n) => n.id === "__loose__");
    const sysA = loose?.children.find((c) => c.id === SYSTEM_A);
    expect(sysA?.children.length).toBe(1);
    expect(sysA?.children[0]?.tier).toBe("sub");
  });
});

describe("systemsContainingPoint", () => {
  test("returns the executeRouter rows for a containing point", async () => {
    state.executeRouter.length = 0;
    state.executeRouter.push({
      match: "ST_Contains",
      rows: [
        { id: SYSTEM_A, name: "Mountains Park", slug: "mountains", distance_m: 0 },
      ],
    });
    const res = await systemsContainingPoint(-82.99, 39.96);
    expect(res.hits.length).toBe(1);
    expect(res.usedFallback).toBe(false);
  });

  test("falls back to nearest when no containment", async () => {
    state.executeRouter.length = 0;
    state.executeRouter.push({
      match: "ST_Contains",
      rows: [],
    });
    state.executeRouter.push({
      match: "ORDER BY",
      rows: [
        { id: SYSTEM_A, name: "Nearby", slug: "nearby", distance_m: 1234 },
      ],
    });
    const res = await systemsContainingPoint(-82.99, 39.96);
    expect(res.usedFallback).toBe(true);
    expect(res.hits.length).toBe(1);
  });
});

import { mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { Store } from "../src/store";

let dir: string;
let store: Store;
let secret: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grundriss-store-"));
  store = new Store(dir);
  secret = store.ensureRoot()!;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("rolls back a revision and its name if saving the metadata fails", () => {
  const root = store.token(secret)!;
  const plan = store.createPlan(root, "Original", "one");
  const metadata = join(dir, "data.json");
  renameSync(metadata, `${metadata}.backup`);
  mkdirSync(metadata);
  expect(() => store.saveRevision(root, plan, "1", "two", "Changed")).toThrow();
  const current = store.plan(plan.id)!;
  expect(current.name).toBe("Original");
  expect(current.revisions).toHaveLength(1);
  expect(store.revisionData(current, "1")).toBe("one");
  rmSync(metadata, { recursive: true });
  renameSync(`${metadata}.backup`, metadata);
  store.saveRevision(store.token(secret)!, current, "1", "retry");
  const reopened = new Store(dir);
  expect(reopened.plan(plan.id)!.revisions).toHaveLength(2);
  expect(reopened.revisionData(reopened.plan(plan.id)!, "2")).toBe("retry");
});

it("does not retain a plan when its first revision cannot be written", () => {
  rmSync(join(dir, "plans"), { recursive: true });
  writeFileSync(join(dir, "plans"), "blocked");
  expect(() => store.createPlan(store.token(secret)!, "Lost", "data")).toThrow();
  expect(store.plans(store.token(secret)!)).toHaveLength(0);
});

it("does not retain a token after a failed metadata write", () => {
  mkdirSync(join(dir, "data.json.tmp"));
  expect(() => store.makeToken(store.token(secret)!, { kind: "user", label: "Failed" })).toThrow();
  expect(store.tokens(store.token(secret)!)).toHaveLength(1);
});

it("removes the tokens that ended, with the tokens that they made", () => {
  const root = store.token(secret)!;
  const lead = store.makeToken(root, {
    kind: "user",
    label: "Lead",
    write: true,
    makeUsers: true,
    createPlans: true,
    expires: Date.now() + 1000,
  });
  const staff = store.makeToken(lead.record, { kind: "user", label: "Staff", write: true });
  const keep = store.makeToken(root, { kind: "user", label: "Keep", write: true });
  expect(store.removeExpired(Date.now())).toBe(0);
  expect(store.removeExpired(Date.now() + 2000)).toBe(2);
  const labels = store.tokens(root).map((t) => t.label);
  expect(labels).toContain("Keep");
  expect(labels).not.toContain("Lead");
  expect(labels).not.toContain("Staff");
  expect(store.token(keep.token)).not.toBeNull();
  expect(store.token(staff.token)).toBeNull();
});

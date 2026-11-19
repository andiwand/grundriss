import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { checkPassword, hashPassword, Store, type Access } from "../src/store";

let dir: string;
let store: Store;
let admin: Access;

const PASSWORD = "correct horse";

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "grundriss-store-"));
  store = new Store(dir);
  const account = await store.acceptLink(store.setupLink()!, "Admin", PASSWORD);
  admin = store.access(store.createSession(account))!;
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("keeps only a salted scrypt hash of a password", async () => {
  const one = await hashPassword(PASSWORD);
  const two = await hashPassword(PASSWORD);
  expect(one).toMatch(/^scrypt:16384:8:1:/);
  expect(one).not.toBe(two);
  expect(await checkPassword(PASSWORD, one)).toBe(true);
  expect(await checkPassword("wrong password", one)).toBe(false);
  expect(readFileSync(join(dir, "data.yaml"), "utf8")).not.toContain(PASSWORD);
});

it("rolls back a revision and its name if saving the metadata fails", () => {
  const plan = store.createPlan(admin, "Original", "one");
  const metadata = join(dir, "data.yaml");
  renameSync(metadata, `${metadata}.backup`);
  mkdirSync(metadata);
  expect(() => store.saveRevision(admin, plan, "1", "two", "Changed")).toThrow();
  const current = store.plan(plan.id)!;
  expect(current.name).toBe("Original");
  expect(current.revisions).toHaveLength(1);
  expect(store.revisionData(current, "1")).toBe("one");
  rmSync(metadata, { recursive: true });
  renameSync(`${metadata}.backup`, metadata);
  store.saveRevision(store.accessOf(admin.session.id)!, current, "1", "retry");
  const reopened = new Store(dir);
  expect(reopened.plan(plan.id)!.revisions).toHaveLength(2);
  expect(reopened.revisionData(reopened.plan(plan.id)!, "2")).toBe("retry");
});

it("does not retain a plan when its first revision cannot be written", () => {
  rmSync(join(dir, "plans"), { recursive: true });
  writeFileSync(join(dir, "plans"), "blocked");
  expect(() => store.createPlan(admin, "Lost", "data")).toThrow();
  expect(store.plans(store.accessOf(admin.session.id)!)).toHaveLength(0);
});

it("does not retain a share link after a failed metadata write", () => {
  const plan = store.createPlan(admin, "House", "data");
  mkdirSync(join(dir, "data.yaml.tmp"));
  expect(() => store.makeShare(admin, plan, { label: "Failed" })).toThrow();
  rmSync(join(dir, "data.yaml.tmp"), { recursive: true });
  expect(store.shares(store.accessOf(admin.session.id)!)).toHaveLength(0);
});

it("removes the sessions, the links, and the share links that ended", () => {
  const plan = store.createPlan(admin, "House", "data");
  const { record: share } = store.makeShare(admin, plan, {
    label: "Short",
    expires: Date.now() + 1000,
  });
  const guest = store.createSession(null);
  store.addGrant(store.access(guest)!.session.id, share);
  store.makeInvite(admin, {});
  expect(store.access(guest)!.shares).toHaveLength(1);
  const later = Date.now() + 100 * 3_600_000;
  // The share link, the guest session with only its grant, and the invite go. The session of
  // the admin lasts 30 days.
  expect(store.removeExpired(later)).toBe(3);
  expect(store.access(guest)).toBeNull();
  expect(store.accessOf(admin.session.id)).not.toBeNull();
});

it("writes a revision as JSON, and reads a YAML revision of an earlier build", () => {
  const data = JSON.stringify({ format: "grundriss", name: "true", walls: [{ id: "w", t: 0.3 }] });
  const plan = store.createPlan(admin, "House", data);
  const file = join(dir, "plans", plan.id, "1.json");
  expect(readFileSync(file, "utf8")).toBe(data);
  expect(existsSync(`${file}.tmp`)).toBe(false);
  rmSync(file);
  writeFileSync(
    join(dir, "plans", plan.id, "1.yaml"),
    'format: grundriss\nname: "true"\nwalls:\n  - { id: w, t: 0.3 }\n',
  );
  expect(store.revisionData(plan, "1")).toBe(data);
});

it("moves the data of an old server from data.json to data.yaml, without its tokens", () => {
  const old = mkdtempSync(join(tmpdir(), "grundriss-old-"));
  mkdirSync(join(old, "plans", "p1"), { recursive: true });
  writeFileSync(join(old, "plans", "p1", "1.json"), '{"a":"grundriss-blob:abc-def-10"}');
  writeFileSync(
    join(old, "data.json"),
    JSON.stringify({
      version: 1,
      settings: { name: "Old" },
      tokens: [{ id: "t1", hash: "x", kind: "root", label: "Root" }],
      plans: [
        {
          id: "p1",
          name: "Old house",
          owner: "t1",
          created: 1,
          revisions: [{ id: "1", parent: null, time: 1, by: "Root", size: 40 }],
        },
      ],
    }),
  );
  const moved = new Store(old);
  expect(existsSync(join(old, "data.yaml"))).toBe(true);
  expect(existsSync(join(old, "data.json"))).toBe(false);
  expect(existsSync(join(old, "data.json.old"))).toBe(true);
  const yaml = readFileSync(join(old, "data.yaml"), "utf8");
  expect(yaml).toContain("name: Old house");
  expect(yaml).not.toContain("tokens");
  // The revision knows its size on the disk and its image.
  expect(moved.plan("p1")!.revisions[0]).toMatchObject({ stored: 33, blobs: ["abc-def-10"] });
  rmSync(old, { recursive: true, force: true });
});

it("gives the plans of an old server to the admin at the setup", async () => {
  const old = mkdtempSync(join(tmpdir(), "grundriss-old-"));
  writeFileSync(
    join(old, "data.json"),
    JSON.stringify({
      version: 1,
      settings: { name: "Old" },
      tokens: [],
      plans: [{ id: "p1", name: "Old house", owner: "t1", created: 1, revisions: [] }],
    }),
  );
  const moved = new Store(old);
  const account = await moved.acceptLink(moved.setupLink()!, "Admin", PASSWORD);
  expect(moved.plan("p1")!.owner).toBe(account.id);
  expect(moved.setupLink()).toBeNull();
  rmSync(old, { recursive: true, force: true });
});

it("never reads a file of the server through a text of the plan that looks like an image", () => {
  const plan = store.createPlan(
    admin,
    "Plan",
    JSON.stringify({ name: "grundriss-blob:../data.yaml" }),
  );
  expect(store.revisionData(plan, "1")).toBe(
    JSON.stringify({ name: "grundriss-blob:../data.yaml" }),
  );
});

it("removes the files of a deleted plan, and keeps the images that another plan has", () => {
  const image = (text: string) => `"data:image/png;base64,${text.repeat(5000)}"`;
  const one = store.createPlan(admin, "One", `[${image("A")},${image("B")}]`);
  const two = store.createPlan(admin, "Two", `[${image("A")}]`);
  const blobs = () => readdirSync(join(dir, "blobs")).length;
  expect(blobs()).toBe(2);
  store.removePlan(admin, one);
  expect(existsSync(join(dir, "plans", one.id))).toBe(false);
  expect(blobs()).toBe(1);
  expect(store.revisionData(store.plan(two.id)!, "1")).toBe(`[${image("A")}]`);
});

it("refuses the data of a newer server, and does not change it", () => {
  const file = join(dir, "data.yaml");
  writeFileSync(file, "version: 3\naccounts: []\n");
  expect(() => new Store(dir)).toThrow(/newer version/);
  expect(readFileSync(file, "utf8")).toBe("version: 3\naccounts: []\n");
});

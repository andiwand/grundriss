// The data of the server: the tokens, the plans, and their revisions.
//
// The tokens and the plans are in one JSON file (`data.json`), which the store writes again
// after each change, through a temporary file, so that a crash does not leave half a file. The
// files of the revisions are separate, one file for each revision. The large images of a plan are
// in `blobs/`, once for all revisions, and a revision refers to them by hash (src/model/blobs.ts). A private server has a few
// users and some dozen plans, so this is enough, and the image needs no native module.
//
// The store keeps only the hash of each token. The token itself shows once, when the store
// makes it.

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dehydrate, hydrate } from "../../src/model/blobs";

export type TokenKind = "root" | "user" | "plan";

export interface TokenRecord {
  /** A public id, for the lists and the removal. It is not the secret. */
  id: string;
  hash: string;
  kind: TokenKind;
  label: string;
  /** The id of the token that made this token, or null for root. */
  maker: string | null;
  /** The plan of a plan token. */
  planId: string | null;
  write: boolean;
  /** Only for user tokens: can make plans, sees all plans, can make user tokens. */
  createPlans: boolean;
  seeAll: boolean;
  makeUsers: boolean;
  /** The end of the token in ms since 1970, or null. */
  expires: number | null;
  created: number;
}

export interface RevisionRecord {
  id: string;
  /** The revision that this one starts from, or null for the first. */
  parent: string | null;
  time: number;
  /** The label of the token that saved it. */
  by: string;
  size: number;
}

export interface PlanRecord {
  id: string;
  name: string;
  /** The id of the token that made the plan. */
  owner: string;
  revisions: RevisionRecord[];
  created: number;
}

export interface Settings {
  /** The name of the server in the app. */
  name: string;
}

interface Data {
  version: 1;
  settings: Settings;
  tokens: TokenRecord[];
  plans: PlanRecord[];
}

/** A random string of 128 bits for a token, or of 64 bits for an id. */
const random = (bytes: number) => randomBytes(bytes).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The rights of a new token. */
export interface TokenRequest {
  kind: "user" | "plan";
  label: string;
  planId?: string | null;
  write?: boolean;
  createPlans?: boolean;
  seeAll?: boolean;
  makeUsers?: boolean;
  expires?: number | null;
}

export class StoreError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class Store {
  private data: Data;
  private persisted: string;
  private byHash = new Map<string, TokenRecord>();

  constructor(private readonly dir: string) {
    mkdirSync(join(dir, "plans"), { recursive: true });
    mkdirSync(join(dir, "blobs"), { recursive: true });
    const file = join(dir, "data.json");
    this.data = existsSync(file)
      ? (JSON.parse(readFileSync(file, "utf8")) as Data)
      : { version: 1, settings: { name: "Grundriss" }, tokens: [], plans: [] };
    this.persisted = JSON.stringify(this.data);
    this.index();
  }

  private index(): void {
    this.byHash = new Map(this.data.tokens.map((t) => [t.hash, t]));
  }

  private save(): void {
    const file = join(this.dir, "data.json");
    try {
      const text = JSON.stringify(this.data, null, 1);
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
      this.persisted = text;
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  private rollback(): void {
    this.data = JSON.parse(this.persisted) as Data;
    this.index();
  }

  // ----- Tokens -----

  /**
   * Makes sure that the root token exists. With `wanted`, root has that token. Without it, a new
   * root token comes only if there is none. It gives the token if it is new, else null.
   */
  ensureRoot(wanted?: string): string | null {
    const root = this.data.tokens.find((t) => t.kind === "root");
    if (root && (!wanted || root.hash === hashToken(wanted))) return null;
    const token = wanted || random(16);
    if (root) {
      root.hash = hashToken(token);
    } else {
      this.data.tokens.push({
        id: random(8),
        hash: hashToken(token),
        kind: "root",
        label: "Root",
        maker: null,
        planId: null,
        write: true,
        createPlans: true,
        seeAll: true,
        makeUsers: true,
        expires: null,
        created: Date.now(),
      });
    }
    this.index();
    this.save();
    return wanted ? null : token;
  }

  /** The token of a secret, if it exists and did not end. */
  token(secret: string, now = Date.now()): TokenRecord | null {
    const record = this.byHash.get(hashToken(secret));
    return record && this.active(record, now) ? record : null;
  }

  /** Rechecks a token held by a request, a lease, or an event stream. */
  active(record: TokenRecord, now = Date.now()): boolean {
    let current: TokenRecord | undefined = this.byHash.get(record.hash);
    if (!current || current.id !== record.id) return false;
    while (current) {
      if (current.expires !== null && current.expires <= now) return false;
      if (current.planId && !this.plan(current.planId)) return false;
      if (!current.maker) return true;
      current = this.data.tokens.find((t) => t.id === current!.maker);
    }
    return false;
  }

  /** The tokens that the token can see: root all, a user the tokens that it made. */
  tokens(by: TokenRecord, planId?: string): TokenRecord[] {
    const list =
      by.kind === "root" ? this.data.tokens : this.data.tokens.filter((t) => this.madeBy(t, by));
    return list.filter((t) => !planId || t.planId === planId);
  }

  /** True if `by` made the token, directly or through tokens that it made. */
  private madeBy(token: TokenRecord, by: TokenRecord): boolean {
    for (let id = token.maker; id;) {
      if (id === by.id) return true;
      id = this.data.tokens.find((t) => t.id === id)?.maker ?? null;
    }
    return false;
  }

  /**
   * Makes a token for `by`. A token gets at most the rights of its maker: root makes all tokens;
   * a user that can write makes plan tokens for the plans that it can write, and user tokens if
   * it may; a user that only reads, and a plan token, make none.
   */
  makeToken(by: TokenRecord, request: TokenRequest): { record: TokenRecord; token: string } {
    const root = by.kind === "root";
    if (!root && (by.kind !== "user" || !by.write)) {
      throw new StoreError(403, "This token cannot make tokens.");
    }
    const label = String(request.label ?? "")
      .trim()
      .slice(0, 80);
    if (!label) throw new StoreError(400, "A token needs a label.");
    let expires = request.expires ?? null;
    if (expires !== null && (!Number.isFinite(expires) || expires <= Date.now())) {
      throw new StoreError(400, "The end date is in the past.");
    }
    // A token ends at the latest with its maker.
    if (by.expires !== null)
      expires = expires === null ? by.expires : Math.min(expires, by.expires);
    const write = request.write === true && by.write;
    let record: TokenRecord;
    if (request.kind === "plan") {
      const plan = request.planId ? this.plan(request.planId) : null;
      if (!plan) throw new StoreError(404, "The plan does not exist.");
      if (!this.canWrite(by, plan)) throw new StoreError(403, "This token cannot share the plan.");
      record = {
        ...base(),
        kind: "plan",
        planId: plan.id,
        write,
        createPlans: false,
        seeAll: false,
        makeUsers: false,
      };
    } else if (request.kind === "user") {
      if (!root && !by.makeUsers) throw new StoreError(403, "This token cannot make users.");
      record = {
        ...base(),
        kind: "user",
        planId: null,
        write,
        createPlans: request.createPlans === true && by.createPlans && write,
        seeAll: request.seeAll === true && by.seeAll,
        makeUsers: request.makeUsers === true && by.makeUsers && write,
      };
    } else {
      throw new StoreError(400, "The kind of the token must be user or plan.");
    }
    function base() {
      return { id: random(8), hash: "", label, maker: by.id, expires, created: Date.now() };
    }
    const token = random(16);
    record.hash = hashToken(token);
    this.data.tokens.push(record);
    this.index();
    this.save();
    return { record, token };
  }

  /** Removes a token and all tokens that it made. Root cannot go. */
  removeToken(by: TokenRecord, id: string): void {
    const target = this.data.tokens.find((t) => t.id === id);
    if (!target || (by.kind !== "root" && !this.madeBy(target, by))) {
      throw new StoreError(404, "The token does not exist.");
    }
    if (target.kind === "root") throw new StoreError(400, "Root cannot be removed.");
    this.removeWithMade([target.id]);
  }

  /**
   * Removes the tokens that ended, and the tokens that they made, which ended with them. It gives
   * the number of removed tokens. The server calls it at the start and then every hour.
   */
  removeExpired(now = Date.now()): number {
    const ended = this.data.tokens.filter(
      (t) => t.kind !== "root" && t.expires !== null && t.expires <= now,
    );
    return ended.length === 0 ? 0 : this.removeWithMade(ended.map((t) => t.id));
  }

  /** Removes the tokens with the ids and all tokens that they made. It gives their number. */
  private removeWithMade(ids: string[]): number {
    const gone = new Set(ids);
    for (let grew = true; grew;) {
      grew = false;
      for (const t of this.data.tokens) {
        if (t.maker && gone.has(t.maker) && !gone.has(t.id)) {
          gone.add(t.id);
          grew = true;
        }
      }
    }
    this.data.tokens = this.data.tokens.filter((t) => !gone.has(t.id));
    this.index();
    this.save();
    return gone.size;
  }

  // ----- Plans -----

  plan(id: string): PlanRecord | undefined {
    return this.data.plans.find((p) => p.id === id);
  }

  /** True if the token sees the plan. */
  canSee(token: TokenRecord, plan: PlanRecord): boolean {
    if (token.kind === "root") return true;
    if (token.kind === "plan") return token.planId === plan.id;
    return token.seeAll || plan.owner === token.id;
  }

  canWrite(token: TokenRecord, plan: PlanRecord): boolean {
    return token.write && this.canSee(token, plan);
  }

  canCreatePlans(token: TokenRecord): boolean {
    return token.kind === "root" || (token.kind === "user" && token.write && token.createPlans);
  }

  plans(token: TokenRecord): PlanRecord[] {
    return this.data.plans.filter((p) => this.canSee(token, p));
  }

  /** The name of the owner of a plan, for the list. */
  ownerLabel(plan: PlanRecord): string {
    return this.data.tokens.find((t) => t.id === plan.owner)?.label ?? "";
  }

  createPlan(by: TokenRecord, name: string, data: string): PlanRecord {
    if (!this.canCreatePlans(by)) throw new StoreError(403, "This token cannot make plans.");
    const plan: PlanRecord = {
      id: random(8),
      name: name.trim().slice(0, 120) || "Plan",
      owner: by.id,
      revisions: [],
      created: Date.now(),
    };
    this.data.plans.push(plan);
    this.addRevision(plan, by, null, data);
    return plan;
  }

  /**
   * Saves a new revision. `parent` must be the current revision, so that a save never replaces a
   * revision that the client did not see (409).
   */
  saveRevision(
    by: TokenRecord,
    plan: PlanRecord,
    parent: string | null,
    data: string,
    name?: string,
  ): RevisionRecord {
    if (!this.canWrite(by, plan)) throw new StoreError(403, "This token cannot write the plan.");
    const current = plan.revisions.at(-1)?.id ?? null;
    if (parent !== current) {
      throw new StoreError(409, "The plan has a newer revision. Load it first.");
    }
    if (name?.trim()) plan.name = name.trim().slice(0, 120);
    return this.addRevision(plan, by, parent, data);
  }

  private addRevision(
    plan: PlanRecord,
    by: TokenRecord,
    parent: string | null,
    data: string,
  ): RevisionRecord {
    const revision: RevisionRecord = {
      id: String(plan.revisions.length + 1),
      parent,
      time: Date.now(),
      by: by.label,
      size: Buffer.byteLength(data),
    };
    try {
      const dir = join(this.dir, "plans", plan.id);
      mkdirSync(dir, { recursive: true });
      // Each large image goes to the store of the blobs once; the revision refers to it.
      const { json, blobs } = dehydrate(data);
      for (const [hash, value] of blobs) {
        const file = join(this.dir, "blobs", hash);
        if (!existsSync(file)) writeFileSync(file, value);
      }
      writeFileSync(join(dir, `${revision.id}.json`), json);
      plan.revisions.push(revision);
      this.save();
    } catch (error) {
      this.rollback();
      throw error;
    }
    return revision;
  }

  revisionData(plan: PlanRecord, id: string): string {
    if (!plan.revisions.some((r) => r.id === id)) {
      throw new StoreError(404, "The revision does not exist.");
    }
    const json = readFileSync(join(this.dir, "plans", plan.id, `${id}.json`), "utf8");
    return hydrate(json, (hash) => {
      const file = join(this.dir, "blobs", hash);
      return existsSync(file) ? readFileSync(file, "utf8") : undefined;
    });
  }

  /** Removes a plan and its plan tokens. The files of its revisions stay on the disk. */
  removePlan(by: TokenRecord, plan: PlanRecord): void {
    if (!(by.kind === "root" || (by.kind === "user" && by.write && plan.owner === by.id))) {
      throw new StoreError(403, "Only the owner or root can delete the plan.");
    }
    this.data.plans = this.data.plans.filter((p) => p.id !== plan.id);
    this.data.tokens = this.data.tokens.filter((t) => t.planId !== plan.id);
    this.index();
    this.save();
  }

  // ----- Settings -----

  get settings(): Settings {
    return this.data.settings;
  }

  saveSettings(settings: Partial<Settings>): void {
    if (typeof settings.name === "string" && settings.name.trim()) {
      this.data.settings.name = settings.name.trim().slice(0, 80);
    }
    this.save();
  }

  counts(): { plans: number; tokens: number } {
    return { plans: this.data.plans.length, tokens: this.data.tokens.length };
  }
}

// The data of the server: the accounts, the sessions, the links, the plans, and their revisions.
//
// The accounts, the links, the sessions, and the plans are in one YAML file (`data.yaml`), which
// the store writes again after each change, through a temporary file, so that a crash does not
// leave half a file. The files of the revisions are separate, one file for each revision. The
// large images of a plan are in `blobs/`, once for all revisions, and a revision refers to them by
// hash (src/model/blobs.ts). A private server has a few users and some dozen plans, so this is
// enough, and the image needs no native module.
//
// The store keeps only the hash of each secret: of the sessions, the links, and the passwords.
// A secret shows once, when the store makes it.
//
// An account has a name and a password. A session is the access of one browser: an account or
// none, and the grants of the share links that the browser opened. A link is for one use: the
// setup of the admin, an invite, or a reset of a password. A share link gives one plan, to view or
// to edit, without an account.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { blobRefs, dehydrate, hydrate } from "../../src/model/blobs";

/** What an account may do. The admin may do all of it, and more. */
export interface Rights {
  /** Make plans. */
  createPlans: boolean;
  /** See and edit the plans of all accounts. */
  seeAll: boolean;
  /** Make invite links for new accounts. */
  makeAccounts: boolean;
}

export interface AccountRecord extends Rights {
  id: string;
  name: string;
  /** The hash of the password: `scrypt:N:r:p:salt:hash`. */
  password: string;
  admin: boolean;
  /** The space of the plans in bytes, or null for the default of the server. 0 is no limit. */
  quota: number | null;
  /** The number of plans, or null for the default of the server. 0 is no limit. */
  maxPlans: number | null;
  created: number;
}

export type LinkKind = "setup" | "invite" | "reset";

/** A link for one use: the setup of the admin, an invite, or the reset of a password. */
export interface LinkRecord {
  id: string;
  hash: string;
  kind: LinkKind;
  /** The account that made the link, or null for the setup. */
  maker: string | null;
  /** The account of a reset. */
  account: string | null;
  /** The rights and the space of the account of an invite. */
  rights: Rights | null;
  quota: number | null;
  expires: number;
  created: number;
}

/** A share link: one plan, to view or to edit, without an account. */
export interface ShareRecord {
  id: string;
  hash: string;
  planId: string;
  label: string;
  write: boolean;
  /** The account that made the link. */
  maker: string;
  expires: number | null;
  created: number;
}

export interface SessionRecord {
  id: string;
  hash: string;
  /** The account that logged in, or null. */
  account: string | null;
  /** The ids of the share links that the browser opened. */
  grants: string[];
  expires: number;
  created: number;
}

export interface RevisionRecord {
  id: string;
  /** The revision that this one starts from, or null for the first. */
  parent: string | null;
  time: number;
  /** The name of the person who saved it. */
  by: string;
  /** The size of the plan file. */
  size: number;
  /** The size of the file of the revision on the disk, without the images. */
  stored: number;
  /** The hashes of the images of the revision. */
  blobs: string[];
}

export interface PlanRecord {
  id: string;
  name: string;
  /** The id of the account that owns the plan. */
  owner: string;
  revisions: RevisionRecord[];
  created: number;
}

export interface Settings {
  /** The name of the server in the app. */
  name: string;
}

interface Data {
  version: 2;
  settings: Settings;
  accounts: AccountRecord[];
  links: LinkRecord[];
  shares: ShareRecord[];
  sessions: SessionRecord[];
  plans: PlanRecord[];
}

/** The defaults of the server. */
export interface StoreOptions {
  /** The time of a link for one use, in hours. */
  linkHours: number;
  /** The time of a session, in days. */
  sessionDays: number;
  /** The space of the plans of an account, in bytes. 0 is no limit. */
  quota: number;
  /** The number of plans of an account. 0 is no limit. */
  maxPlans: number;
}

export const DEFAULT_OPTIONS: StoreOptions = {
  linkHours: 72,
  sessionDays: 30,
  quota: 500 * 1024 * 1024,
  maxPlans: 100,
};

/** The most share links that one session keeps. An older one goes for a new one. */
export const MAX_GRANTS = 50;

/**
 * The access of a request: the session, its account, and the share links that it opened and
 * that are still valid.
 */
export interface Access {
  session: SessionRecord;
  account: AccountRecord | null;
  shares: ShareRecord[];
}

/** A random string of 128 bits for a secret, or of 64 bits for an id. */
const random = (bytes: number) => randomBytes(bytes).toString("base64url");
export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** The size of an image from its hash: the last part of the hash is its length (blobs.ts). */
const blobSize = (hash: string) => parseInt(hash.slice(hash.lastIndexOf("-") + 1), 36) || 0;

const SCRYPT = { N: 16384, r: 8, p: 1 };

function scryptHash(password: string, salt: Buffer, N: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 32, { N, r, p, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

/** The hash of a password, with a new random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptHash(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString("base64")}:${key.toString("base64")}`;
}

/** True if the password has the hash. */
export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, N, r, p, salt, hash] = stored.split(":");
  if (kind !== "scrypt" || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptHash(password, Buffer.from(salt, "base64"), +N, +r, +p);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A password that the server takes: at least 8 characters. */
function checkNewPassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 8)
    throw new StoreError(400, "The password needs at least 8 characters.");
  if (password.length > 200) throw new StoreError(400, "The password is too long.");
  return password;
}

const noRights: Rights = { createPlans: false, seeAll: false, makeAccounts: false };

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
  readonly options: StoreOptions;

  constructor(
    private readonly dir: string,
    options: Partial<StoreOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    mkdirSync(join(dir, "plans"), { recursive: true });
    mkdirSync(join(dir, "blobs"), { recursive: true });
    const file = join(dir, "data.yaml");
    // Before 0.6, the data was in data.json. The store reads it once, writes data.yaml, and
    // keeps the old file as data.json.old.
    const old = join(dir, "data.json");
    const fromJson = !existsSync(file) && existsSync(old);
    const loaded: unknown = existsSync(file)
      ? parse(readFileSync(file, "utf8"))
      : fromJson
        ? JSON.parse(readFileSync(old, "utf8"))
        : null;
    const migrated = loaded !== null && (loaded as { version?: number }).version !== 2;
    this.data = loaded ? this.migrate(loaded as Data | OldData) : emptyData();
    this.persisted = JSON.stringify(this.data);
    if (fromJson || migrated) this.save();
    if (fromJson) renameSync(old, `${old}.old`);
  }

  /**
   * The data of an older version. Version 1 had tokens in place of accounts: they do not come
   * along, so a plan has no owner until the admin exists (`acceptLink`). The revisions get their
   * size on the disk and their images.
   */
  private migrate(data: Data | OldData): Data {
    if (data.version === 2) return data;
    const plans = (data.plans ?? []).map((plan) => ({
      ...plan,
      revisions: plan.revisions.map((r) => {
        const file = join(this.dir, "plans", plan.id, `${r.id}.json`);
        const json = existsSync(file) ? readFileSync(file, "utf8") : "";
        return { ...r, stored: existsSync(file) ? statSync(file).size : 0, blobs: blobRefs(json) };
      }),
    }));
    return { ...emptyData(), settings: data.settings ?? emptyData().settings, plans };
  }

  private save(): void {
    const file = join(this.dir, "data.yaml");
    try {
      writeFileSync(`${file}.tmp`, stringify(this.data));
      renameSync(`${file}.tmp`, file);
      this.persisted = JSON.stringify(this.data);
    } catch (error) {
      this.rollback();
      throw error;
    }
  }

  private rollback(): void {
    this.data = JSON.parse(this.persisted) as Data;
  }

  // ----- Accounts -----

  account(id: string | null): AccountRecord | undefined {
    return id ? this.data.accounts.find((a) => a.id === id) : undefined;
  }

  private accountByName(name: string): AccountRecord | undefined {
    const key = name.trim().toLowerCase();
    return this.data.accounts.find((a) => a.name.toLowerCase() === key);
  }

  hasAdmin(): boolean {
    return this.data.accounts.some((a) => a.admin);
  }

  /** A name that the server takes: unique, 1 to 40 characters. */
  private checkName(name: unknown, except?: AccountRecord): string {
    const value = typeof name === "string" ? name.trim() : "";
    if (!value) throw new StoreError(400, "An account needs a name.");
    if (value.length > 40) throw new StoreError(400, "The name is too long.");
    const other = this.accountByName(value);
    if (other && other !== except) throw new StoreError(409, "This name is taken.");
    return value;
  }

  /** The account of a name and a password, or null. */
  async login(name: unknown, password: unknown): Promise<AccountRecord | null> {
    const account = typeof name === "string" ? this.accountByName(name) : undefined;
    if (!account || typeof password !== "string") {
      // The same work without an account, so that the time tells nothing.
      await hashPassword(String(password ?? ""));
      return null;
    }
    return (await checkPassword(password, account.password)) ? account : null;
  }

  async changePassword(access: Access, old: unknown, next: unknown): Promise<void> {
    const account = access.account;
    if (!account) throw new StoreError(401, "Log in first.");
    if (!(await checkPassword(String(old ?? ""), account.password)))
      throw new StoreError(403, "The old password is wrong.");
    const hash = await hashPassword(checkNewPassword(next));
    const current = this.account(account.id);
    if (!current) throw new StoreError(401, "Log in first.");
    current.password = hash;
    // The other sessions of the account end, this one stays.
    this.data.sessions = this.data.sessions.filter(
      (s) => s.account !== current.id || s.id === access.session.id,
    );
    this.save();
  }

  /** The accounts, for the admin. */
  accounts(access: Access): AccountRecord[] {
    this.requireAdmin(access);
    return this.data.accounts;
  }

  /** Changes the rights and the limits of an account. */
  updateAccount(
    access: Access,
    id: string,
    change: Partial<Rights & { admin: boolean; quota: number | null; maxPlans: number | null }>,
  ): AccountRecord {
    this.requireAdmin(access);
    const account = this.account(id);
    if (!account) throw new StoreError(404, "The account does not exist.");
    for (const key of ["createPlans", "seeAll", "makeAccounts", "admin"] as const) {
      if (typeof change[key] === "boolean") account[key] = change[key];
    }
    // The admin cannot take the own admin away, so that the server always has one.
    if (account.id === access.account!.id) account.admin = true;
    for (const key of ["quota", "maxPlans"] as const) {
      const value = change[key];
      if (value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0))
        account[key] = value === null ? null : Math.round(value);
    }
    this.save();
    return account;
  }

  /**
   * Removes an account. Its plans go to the admin who removes it, so that nothing is lost; its
   * sessions and its links end.
   */
  removeAccount(access: Access, id: string): void {
    this.requireAdmin(access);
    if (id === access.account!.id) throw new StoreError(400, "You cannot remove your own account.");
    if (!this.account(id)) throw new StoreError(404, "The account does not exist.");
    for (const plan of this.data.plans) if (plan.owner === id) plan.owner = access.account!.id;
    for (const share of this.data.shares) if (share.maker === id) share.maker = access.account!.id;
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
    this.data.sessions = this.data.sessions.filter((s) => s.account !== id);
    this.data.links = this.data.links.filter((l) => l.maker !== id && l.account !== id);
    this.save();
  }

  private requireAdmin(access: Access): void {
    if (!access.account?.admin) throw new StoreError(403, "Only the admin can do this.");
  }

  /** The space and the number of plans that an account may use. 0 is no limit. */
  limits(account: AccountRecord): { quota: number; maxPlans: number } {
    return {
      quota: account.quota ?? this.options.quota,
      maxPlans: account.maxPlans ?? this.options.maxPlans,
    };
  }

  /** The number of plans of an account. */
  planCount(accountId: string): number {
    return this.data.plans.filter((p) => p.owner === accountId).length;
  }

  /** The space of the plans of an account: the revisions and their images, each image once. */
  usage(accountId: string, extra?: { stored: number; blobs: string[] }): number {
    let bytes = extra?.stored ?? 0;
    const images = new Set(extra?.blobs ?? []);
    for (const plan of this.data.plans) {
      if (plan.owner !== accountId) continue;
      for (const r of plan.revisions) {
        bytes += r.stored;
        for (const hash of r.blobs) images.add(hash);
      }
    }
    for (const hash of images) bytes += blobSize(hash);
    return bytes;
  }

  // ----- Links for one use -----

  private makeLink(link: Omit<LinkRecord, "id" | "hash" | "expires" | "created">): string {
    const code = random(16);
    const now = Date.now();
    this.data.links.push({
      ...link,
      id: random(8),
      hash: hashSecret(code),
      expires: now + this.options.linkHours * 3_600_000,
      created: now,
    });
    this.save();
    return code;
  }

  /**
   * The link to set up the admin, while there is none. Each call makes a new link, and the older
   * ones end. It gives null if the admin exists.
   */
  setupLink(): string | null {
    if (this.hasAdmin()) return null;
    this.data.links = this.data.links.filter((l) => l.kind !== "setup");
    return this.makeLink({ kind: "setup", maker: null, account: null, rights: null, quota: null });
  }

  /** A link to set a new password of the first admin, for a restart with GRUNDRISS_ADMIN_RESET. */
  adminResetLink(): string | null {
    const admin = this.data.accounts.find((a) => a.admin);
    if (!admin) return null;
    return this.makeLink({
      kind: "reset",
      maker: null,
      account: admin.id,
      rights: null,
      quota: null,
    });
  }

  /** An invite link for a new account, with rights of at most those of its maker. */
  makeInvite(access: Access, request: Partial<Rights> & { quota?: unknown }): string {
    const by = access.account;
    if (!by || !(by.admin || by.makeAccounts))
      throw new StoreError(403, "This account cannot invite.");
    const may = (key: keyof Rights) => request[key] === true && (by.admin || by[key]);
    // Only the admin chooses the space; else the account gets the default.
    const quota =
      by.admin && typeof request.quota === "number" && request.quota >= 0
        ? Math.round(request.quota)
        : null;
    return this.makeLink({
      kind: "invite",
      maker: by.id,
      account: null,
      rights: {
        createPlans: request.createPlans !== false && (by.admin || by.createPlans),
        seeAll: may("seeAll"),
        makeAccounts: may("makeAccounts"),
      },
      quota,
    });
  }

  /** A link to set a new password of an account, for the admin to send. */
  makeReset(access: Access, accountId: string): string {
    this.requireAdmin(access);
    if (!this.account(accountId)) throw new StoreError(404, "The account does not exist.");
    return this.makeLink({
      kind: "reset",
      maker: access.account!.id,
      account: accountId,
      rights: null,
      quota: null,
    });
  }

  /** The open links that an account made: all of them for the admin. */
  links(access: Access, now = Date.now()): LinkRecord[] {
    const by = access.account;
    if (!by) throw new StoreError(401, "Log in first.");
    return this.data.links.filter(
      (l) => l.kind !== "setup" && l.expires > now && (by.admin || l.maker === by.id),
    );
  }

  removeLink(access: Access, id: string): void {
    const link = this.links(access).find((l) => l.id === id);
    if (!link) throw new StoreError(404, "The link does not exist.");
    this.data.links = this.data.links.filter((l) => l !== link);
    this.save();
  }

  /** The valid link of a code, or undefined. */
  link(code: string, now = Date.now()): LinkRecord | undefined {
    if (!code) return undefined;
    const hash = hashSecret(code);
    const link = this.data.links.find((l) => l.hash === hash);
    if (!link || link.expires <= now) return undefined;
    if (link.kind === "setup" && this.hasAdmin()) return undefined;
    if (link.kind === "reset" && !this.account(link.account)) return undefined;
    return link;
  }

  /**
   * Uses a link: the setup makes the admin, an invite makes an account, and a reset sets a new
   * password. The link ends. It gives the account, for the login.
   */
  async acceptLink(code: string, name: unknown, password: unknown): Promise<AccountRecord> {
    const hash = await hashPassword(checkNewPassword(password));
    // The hash takes a moment: the link and the name count after it.
    const link = this.link(code);
    if (!link) throw new StoreError(404, "The link is not valid. It can be used or too old.");
    let account: AccountRecord;
    if (link.kind === "reset") {
      account = this.account(link.account)!;
      account.password = hash;
      // A new password ends all sessions of the account.
      this.data.sessions = this.data.sessions.filter((s) => s.account !== account.id);
    } else {
      const admin = link.kind === "setup";
      const rights = admin ? { createPlans: true, seeAll: true, makeAccounts: true } : link.rights;
      account = {
        id: random(8),
        name: this.checkName(name),
        password: hash,
        admin,
        ...(rights ?? noRights),
        quota: link.quota,
        maxPlans: null,
        created: Date.now(),
      };
      this.data.accounts.push(account);
      // The plans of an older server have no owner: they go to the admin.
      if (admin) {
        for (const plan of this.data.plans) if (!this.account(plan.owner)) plan.owner = account.id;
      }
    }
    this.data.links = this.data.links.filter((l) => l.id !== link.id);
    this.save();
    return account;
  }

  // ----- Sessions -----

  /** Makes a session, with an account or none, and the grants of an older session. */
  createSession(account: AccountRecord | null, grants: string[] = []): string {
    const secret = random(32);
    const now = Date.now();
    this.data.sessions.push({
      id: random(8),
      hash: hashSecret(secret),
      account: account?.id ?? null,
      grants: grants.slice(-MAX_GRANTS),
      expires: now + this.options.sessionDays * 86_400_000,
      created: now,
    });
    this.save();
    return secret;
  }

  /** The access of the secret of a session, or null if it does not exist or ended. */
  access(secret: string, now = Date.now()): Access | null {
    if (!secret) return null;
    const hash = hashSecret(secret);
    const session = this.data.sessions.find((s) => s.hash === hash);
    return session ? this.accessOf(session.id, now) : null;
  }

  /** The current access of a session by its id, for a request or a stream that holds it. */
  accessOf(sessionId: string, now = Date.now()): Access | null {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session || session.expires <= now) return null;
    const account = this.account(session.account) ?? null;
    if (session.account && !account) return null;
    const shares = session.grants
      .map((id) => this.data.shares.find((s) => s.id === id))
      .filter((s): s is ShareRecord => !!s && this.shareActive(s, now));
    return { session, account, shares };
  }

  endSession(sessionId: string): void {
    this.data.sessions = this.data.sessions.filter((s) => s.id !== sessionId);
    this.save();
  }

  /** Adds the grant of a share link to a session. The oldest grant goes if there are too many. */
  addGrant(sessionId: string, share: ShareRecord): void {
    const session = this.data.sessions.find((s) => s.id === sessionId);
    if (!session) return;
    session.grants = [...session.grants.filter((id) => id !== share.id), share.id].slice(
      -MAX_GRANTS,
    );
    this.save();
  }

  // ----- Share links -----

  private shareActive(share: ShareRecord, now = Date.now()): boolean {
    return (share.expires === null || share.expires > now) && !!this.plan(share.planId);
  }

  /** The valid share link of a token, or undefined. */
  share(token: string, now = Date.now()): ShareRecord | undefined {
    if (!token) return undefined;
    const hash = hashSecret(token);
    const share = this.data.shares.find((s) => s.hash === hash);
    return share && this.shareActive(share, now) ? share : undefined;
  }

  /** Makes a share link of a plan. It gives the record and the token, which shows only now. */
  makeShare(
    access: Access,
    plan: PlanRecord,
    request: { label?: unknown; write?: unknown; expires?: unknown },
  ): { record: ShareRecord; token: string } {
    if (!this.canShare(access, plan)) throw new StoreError(403, "You cannot share this plan.");
    const label = String(request.label ?? "")
      .trim()
      .slice(0, 80);
    if (!label) throw new StoreError(400, "A link needs a label.");
    const expires = request.expires ?? null;
    if (expires !== null && (typeof expires !== "number" || expires <= Date.now()))
      throw new StoreError(400, "The end date is in the past.");
    const token = random(16);
    const record: ShareRecord = {
      id: random(8),
      hash: hashSecret(token),
      planId: plan.id,
      label,
      write: request.write === true,
      maker: access.account!.id,
      expires: expires as number | null,
      created: Date.now(),
    };
    this.data.shares.push(record);
    this.save();
    return { record, token };
  }

  /**
   * The share links that an account sees: of one plan that it can share, or all links of the
   * plans that it can share.
   */
  shares(access: Access, planId?: string): ShareRecord[] {
    return this.data.shares.filter((s) => {
      if (planId && s.planId !== planId) return false;
      const plan = this.plan(s.planId);
      return !!plan && this.canShare(access, plan) && this.shareActive(s);
    });
  }

  removeShare(access: Access, id: string): void {
    const share = this.shares(access).find((s) => s.id === id);
    if (!share) throw new StoreError(404, "The link does not exist.");
    this.data.shares = this.data.shares.filter((s) => s.id !== id);
    for (const session of this.data.sessions)
      session.grants = session.grants.filter((g) => g !== id);
    this.save();
  }

  /**
   * Removes the sessions, the links, and the share links that ended, and the sessions without an
   * account and without grants. It gives their number. The server calls it at the start and then
   * every hour.
   */
  removeExpired(now = Date.now()): number {
    const count = () =>
      this.data.sessions.length + this.data.links.length + this.data.shares.length;
    const before = count();
    this.data.shares = this.data.shares.filter((s) => this.shareActive(s, now));
    const shares = new Set(this.data.shares.map((s) => s.id));
    this.data.links = this.data.links.filter((l) => l.expires > now);
    this.data.sessions = this.data.sessions.filter((s) => {
      s.grants = s.grants.filter((g) => shares.has(g));
      return s.expires > now && (s.account !== null || s.grants.length > 0);
    });
    const removed = before - count();
    if (removed > 0) this.save();
    return removed;
  }

  // ----- Plans -----

  plan(id: string): PlanRecord | undefined {
    return this.data.plans.find((p) => p.id === id);
  }

  /** The admin, an account that sees all plans, or the owner. */
  private manages(access: Access, plan: PlanRecord): boolean {
    const a = access.account;
    return !!a && (a.admin || a.seeAll || plan.owner === a.id);
  }

  canSee(access: Access, plan: PlanRecord): boolean {
    return this.manages(access, plan) || access.shares.some((s) => s.planId === plan.id);
  }

  canWrite(access: Access, plan: PlanRecord): boolean {
    return this.manages(access, plan) || access.shares.some((s) => s.planId === plan.id && s.write);
  }

  /** Share links: only an account that manages the plan, not a share link. */
  canShare(access: Access, plan: PlanRecord): boolean {
    return this.manages(access, plan);
  }

  canDelete(access: Access, plan: PlanRecord): boolean {
    const a = access.account;
    return !!a && (a.admin || plan.owner === a.id);
  }

  canCreatePlans(access: Access): boolean {
    const a = access.account;
    return !!a && (a.admin || a.createPlans);
  }

  plans(access: Access): PlanRecord[] {
    return this.data.plans.filter((p) => this.canSee(access, p));
  }

  /** The name of the person of a request for the plan: the account, or the label of the link. */
  nameOf(access: Access, planId: string): string {
    return access.account?.name ?? access.shares.find((s) => s.planId === planId)?.label ?? "Guest";
  }

  /** The name of the owner of a plan, for the list. */
  ownerName(plan: PlanRecord): string {
    return this.account(plan.owner)?.name ?? "";
  }

  createPlan(access: Access, name: string, data: string): PlanRecord {
    if (!this.canCreatePlans(access)) throw new StoreError(403, "This account cannot make plans.");
    const account = access.account!;
    const { maxPlans } = this.limits(account);
    if (maxPlans > 0 && this.planCount(account.id) >= maxPlans)
      throw new StoreError(413, "This account has the most plans that it may have.");
    const plan: PlanRecord = {
      id: random(8),
      name: name.trim().slice(0, 120) || "Plan",
      owner: account.id,
      revisions: [],
      created: Date.now(),
    };
    this.data.plans.push(plan);
    try {
      this.addRevision(plan, this.nameOf(access, plan.id), null, data);
    } catch (error) {
      this.data.plans = this.data.plans.filter((p) => p.id !== plan.id);
      throw error;
    }
    return plan;
  }

  /**
   * Saves a new revision. `parent` must be the current revision, so that a save never replaces a
   * revision that the client did not see (409).
   */
  saveRevision(
    access: Access,
    plan: PlanRecord,
    parent: string | null,
    data: string,
    name?: string,
  ): RevisionRecord {
    if (!this.canWrite(access, plan)) throw new StoreError(403, "You can only view this plan.");
    const current = plan.revisions.at(-1)?.id ?? null;
    if (parent !== current) {
      throw new StoreError(409, "The plan has a newer revision. Load it first.");
    }
    if (name?.trim()) plan.name = name.trim().slice(0, 120);
    return this.addRevision(plan, this.nameOf(access, plan.id), parent, data);
  }

  private addRevision(
    plan: PlanRecord,
    by: string,
    parent: string | null,
    data: string,
  ): RevisionRecord {
    // Each large image goes to the store of the blobs once; the revision refers to it.
    const { json, blobs } = dehydrate(data);
    const revision: RevisionRecord = {
      id: String(plan.revisions.length + 1),
      parent,
      time: Date.now(),
      by,
      size: Buffer.byteLength(data),
      stored: Buffer.byteLength(json),
      blobs: [...blobs.keys()],
    };
    try {
      // The space of the owner of the plan, also if another person saves.
      const owner = this.account(plan.owner);
      const quota = owner ? this.limits(owner).quota : 0;
      if (quota > 0 && this.usage(plan.owner, revision) > quota)
        throw new StoreError(413, "The space of the owner of the plan is full.");
      const dir = join(this.dir, "plans", plan.id);
      mkdirSync(dir, { recursive: true });
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

  /** Removes a plan and its share links. The files of its revisions stay on the disk. */
  removePlan(access: Access, plan: PlanRecord): void {
    if (!this.canDelete(access, plan))
      throw new StoreError(403, "Only the owner or the admin can delete the plan.");
    this.data.plans = this.data.plans.filter((p) => p.id !== plan.id);
    this.data.shares = this.data.shares.filter((s) => s.planId !== plan.id);
    this.save();
  }

  // ----- Settings -----

  get settings(): Settings {
    return this.data.settings;
  }

  saveSettings(access: Access, settings: Partial<Settings>): void {
    this.requireAdmin(access);
    if (typeof settings.name === "string" && settings.name.trim()) {
      this.data.settings.name = settings.name.trim().slice(0, 80);
    }
    this.save();
  }

  counts(): { plans: number; accounts: number; shares: number } {
    return {
      plans: this.data.plans.length,
      accounts: this.data.accounts.length,
      shares: this.data.shares.length,
    };
  }
}

/** The data of version 1: tokens in place of accounts. */
interface OldData {
  version: 1;
  settings?: Settings;
  plans?: (Omit<PlanRecord, "revisions"> & {
    revisions: Omit<RevisionRecord, "stored" | "blobs">[];
  })[];
}

function emptyData(): Data {
  return {
    version: 2,
    settings: { name: "Grundriss" },
    accounts: [],
    links: [],
    shares: [],
    sessions: [],
    plans: [],
  };
}

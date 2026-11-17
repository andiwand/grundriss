// The client of the API of the Grundriss server that serves this app (server/src/app.ts). The
// app is at `/app/` of the server, and the API at `/api/`. The session is a cookie that the
// browser sends by itself, so the app never sees it.

import type { Patch } from "../model/patch";

/** The version of the API that the app knows. */
export const API_VERSION = 2;

export interface Rights {
  createPlans: boolean;
  seeAll: boolean;
  makeAccounts: boolean;
}

export interface Account extends Rights {
  id: string;
  name: string;
  admin: boolean;
  /** The own space in bytes, or null for the default of the server. 0 is no limit. */
  quota: number | null;
  /** The own number of plans, or null for the default of the server. 0 is no limit. */
  maxPlans: number | null;
  /** The space and the number of plans that count: the own ones or the defaults. */
  limit: number;
  planLimit: number;
  /** The space that the plans use, in bytes, and their number. */
  used: number;
  plans: number;
  created: number;
}

/** The session of this browser: the server, the account, and the plans of share links. */
export interface SessionInfo {
  api: number;
  version: string;
  /** The name of the server. */
  server: string;
  account: Account | null;
  grants: { planId: string; write: boolean }[];
}

/** A person who has a plan open, with the state that the app of that person sends. */
export interface Person {
  client: string;
  name: string;
  write: boolean;
  state: unknown;
}

export interface RemotePlan {
  id: string;
  name: string;
  owner: string;
  revision: string;
  updated: number;
  by: string;
  write: boolean;
  /** True if this account can make share links of the plan. */
  share: boolean;
  /** True if this account can delete the plan. */
  delete: boolean;
  /** The SVG of the ground floor, or "". Only in the list of the plans. */
  preview?: string;
}

export interface Revision {
  id: string;
  parent: string | null;
  time: number;
  by: string;
  size: number;
}

export interface Share {
  id: string;
  planId: string;
  planName: string;
  label: string;
  write: boolean;
  expires: number | null;
  created: number;
}

/** An open link for one use that an account made: an invite or a reset. */
export interface Invite {
  id: string;
  kind: "invite" | "reset";
  /** The name of the account of a reset. */
  account: string;
  rights: Rights | null;
  quota: number | null;
  expires: number;
  created: number;
}

export interface ServerSettings {
  name: string;
  plans: number;
  accounts: number;
  shares: number;
  version: string;
  publicSite: boolean;
  /** The defaults of an account. */
  quota: number;
  maxPlans: number;
  linkHours: number;
}

/** An error of the server, with its HTTP status. */
export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

export class ServerClient {
  /** The address of the server, without a slash at its end. */
  readonly base: string;

  /** `client` names this tab, for the presence and the own changes. */
  constructor(
    base: string,
    readonly client = "",
  ) {
    this.base = base.replace(/\/+$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    let text: string;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetch(`${this.base}/api/${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.client ? { "X-Client": this.client } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      throw new ServerError(0, "The server does not answer. Check the network.");
    } finally {
      clearTimeout(timeout);
    }
    let value: unknown = null;
    try {
      value = text ? JSON.parse(text) : null;
    } catch {
      // A page that is not JSON, for example a 404 of another server.
    }
    if (!response.ok) {
      const message =
        (value as { error?: string } | null)?.error ?? `The server answered ${response.status}.`;
      throw new ServerError(response.status, message, value);
    }
    if (value === null && text)
      throw new ServerError(response.status, "This is not a Grundriss server.");
    return value as T;
  }

  /** The address of a path of the server, for a link to send, for example `/s/<token>`. */
  address = (path: string) => `${this.base}${path}`;

  session = () => this.request<SessionInfo>("GET", "session");
  login = (name: string, password: string) =>
    this.request<SessionInfo>("POST", "login", { name, password });
  logout = () => this.request<SessionInfo>("POST", "logout");
  changePassword = (old: string, password: string) =>
    this.request<unknown>("POST", "password", { old, password });
  /** What a link for one use is: a setup, an invite, or a reset (with the name of its account). */
  link = (code: string) =>
    this.request<{ kind: "setup" | "invite" | "reset"; name: string; server: string }>(
      "GET",
      `links/${encodeURIComponent(code)}`,
    );
  acceptLink = (code: string, name: string, password: string) =>
    this.request<SessionInfo>("POST", `links/${encodeURIComponent(code)}`, { name, password });

  plans = () => this.request<RemotePlan[]>("GET", "plans");
  plan = (id: string) => this.request<RemotePlan & { data: string }>("GET", `plans/${id}`);
  createPlan = (name: string, data: string) =>
    this.request<RemotePlan>("POST", "plans", { name, data });
  deletePlan = (id: string, parent?: string) =>
    this.request<unknown>(
      "DELETE",
      `plans/${id}${parent === undefined ? "" : `?parent=${encodeURIComponent(parent)}`}`,
    );
  revisions = (id: string) => this.request<Revision[]>("GET", `plans/${id}/revisions`);
  revision = (id: string, revision: string) =>
    this.request<{ data: string }>("GET", `plans/${id}/revisions/${revision}`);
  /** Sends the changes since the revision `parent`. The server applies them to its last one. */
  sendChanges = (id: string, parent: string, patch: Patch, name?: string) =>
    this.request<RemotePlan>("POST", `plans/${id}/changes`, { parent, patch, name });
  /** Tells the others of a plan the name and the state of this tab. */
  sendPresence = (id: string, name: string, state: unknown) =>
    this.request<unknown>("POST", `plans/${id}/presence`, { name, state });

  shares = (planId?: string) =>
    this.request<Share[]>("GET", planId ? `shares?plan=${encodeURIComponent(planId)}` : "shares");
  createShare = (
    planId: string,
    share: { label: string; write: boolean; expires: number | null },
  ) => this.request<Share & { path: string }>("POST", `plans/${planId}/shares`, share);
  deleteShare = (id: string) => this.request<unknown>("DELETE", `shares/${id}`);

  accounts = () => this.request<Account[]>("GET", "accounts");
  updateAccount = (
    id: string,
    change: Partial<Rights & { admin: boolean; quota: number | null; maxPlans: number | null }>,
  ) => this.request<Account>("PUT", `accounts/${id}`, change);
  deleteAccount = (id: string) => this.request<unknown>("DELETE", `accounts/${id}`);
  resetLink = (id: string) => this.request<{ path: string }>("POST", `accounts/${id}/reset`);
  invites = () => this.request<Invite[]>("GET", "invites");
  createInvite = (invite: Partial<Rights> & { quota?: number | null }) =>
    this.request<{ path: string }>("POST", "invites", invite);
  deleteInvite = (id: string) => this.request<unknown>("DELETE", `invites/${id}`);
  settings = () => this.request<ServerSettings>("GET", "settings");
  saveSettings = (settings: { name: string }) =>
    this.request<ServerSettings>("PUT", "settings", settings);

  /** The stream of the events of a plan: new revisions, the people, the removal. */
  events(id: string): EventSource {
    const client = this.client ? `?client=${encodeURIComponent(this.client)}` : "";
    return new EventSource(`${this.base}/api/plans/${id}/events${client}`);
  }

  /** Leaves the list of the people of a plan when the page closes. */
  leaveOnUnload(id: string): void {
    void fetch(`${this.base}/api/plans/${id}/presence`, {
      method: "DELETE",
      headers: { "X-Client": this.client },
      keepalive: true,
    }).catch(() => undefined);
  }
}

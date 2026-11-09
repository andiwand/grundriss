// The client of the API of a Grundriss server (server/src/app.ts). A connection is the address of
// a token on a server, for example `https://example.org/<token>`: the app and its API are below
// it. The token is the access, so the address is a secret.

/** The version of the API that the app knows. */
export const API_VERSION = 1;

export interface TokenInfo {
  id: string;
  kind: "root" | "user" | "plan";
  label: string;
  planId: string | null;
  write: boolean;
  createPlans: boolean;
  seeAll: boolean;
  makeUsers: boolean;
  expires: number | null;
  created: number;
  /** The name of the plan of a share link, in the list of the tokens. */
  planName?: string | null;
}

export interface Me {
  api: number;
  version: string;
  /** The name of the server. */
  server: string;
  mode: "full" | "api";
  token: TokenInfo;
}

export interface RemotePlan {
  id: string;
  name: string;
  owner: string;
  revision: string;
  updated: number;
  by: string;
  write: boolean;
  lease: { holder: string; until: number } | null;
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

export interface ServerSettings {
  name: string;
  plans: number;
  tokens: number;
  mode: "full" | "api";
  version: string;
  origins: string[];
  appUrl: string;
}

export interface NewToken {
  kind: "user" | "plan";
  label: string;
  planId?: string;
  write?: boolean;
  createPlans?: boolean;
  seeAll?: boolean;
  makeUsers?: boolean;
  expires?: number | null;
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

/** The address without a slash at its end, so that the paths can follow it. */
export const normalizeAddress = (address: string) => address.trim().replace(/\/+$/, "");

export class ServerClient {
  readonly base: string;

  /** `client` names this tab for the edit lease. */
  constructor(
    base: string,
    readonly client = "",
  ) {
    this.base = normalizeAddress(base);
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
        signal: controller.signal,
      });
      text = await response.text();
    } catch {
      throw new ServerError(0, "The server does not answer. Check the network and the address.");
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
        response.status === 404 && !value
          ? "The server does not know this address. The link can be wrong or removed."
          : ((value as { error?: string } | null)?.error ??
            `The server answered ${response.status}.`);
      throw new ServerError(response.status, message, value);
    }
    if (value === null && text)
      throw new ServerError(response.status, "This is not a Grundriss server.");
    return value as T;
  }

  me = () => this.request<Me>("GET", "me");
  plans = () => this.request<RemotePlan[]>("GET", "plans");
  plan = (id: string) => this.request<RemotePlan & { data: string }>("GET", `plans/${id}`);
  createPlan = (name: string, data: string) =>
    this.request<RemotePlan>("POST", "plans", { name, data });
  savePlan = (id: string, parent: string, data: string, name?: string) =>
    this.request<RemotePlan>("PUT", `plans/${id}`, { parent, data, name });
  deletePlan = (id: string, parent?: string) =>
    this.request<unknown>(
      "DELETE",
      `plans/${id}${parent === undefined ? "" : `?parent=${encodeURIComponent(parent)}`}`,
    );
  revisions = (id: string) => this.request<Revision[]>("GET", `plans/${id}/revisions`);
  revision = (id: string, revision: string) =>
    this.request<{ data: string }>("GET", `plans/${id}/revisions/${revision}`);
  takeLease = (id: string) =>
    this.request<{ holder: string; until: number }>("POST", `plans/${id}/lease`);
  releaseLease = (id: string) => this.request<unknown>("DELETE", `plans/${id}/lease`);
  tokens = (planId?: string) =>
    this.request<TokenInfo[]>(
      "GET",
      planId ? `tokens?plan=${encodeURIComponent(planId)}` : "tokens",
    );
  createToken = (token: NewToken) =>
    this.request<TokenInfo & { token: string }>("POST", "tokens", token);
  deleteToken = (id: string) => this.request<unknown>("DELETE", `tokens/${id}`);
  settings = () => this.request<ServerSettings>("GET", "settings");
  saveSettings = (settings: { name: string }) =>
    this.request<ServerSettings>("PUT", "settings", settings);

  /** The stream of the events of a plan: new revisions, the lease, and the removal. */
  events(id: string): EventSource {
    return new EventSource(`${this.base}/api/plans/${id}/events`);
  }

  /** The address of a new token on this server: the server address with the token. */
  tokenAddress(token: string): string {
    return `${this.base.slice(0, this.base.lastIndexOf("/"))}/${token}`;
  }

  /** Gives the lease back when the page closes. `keepalive` lets the request outlive the page. */
  releaseOnUnload(id: string): void {
    void fetch(`${this.base}/api/plans/${id}/lease`, {
      method: "DELETE",
      headers: { "X-Client": this.client },
      keepalive: true,
    }).catch(() => undefined);
  }
}

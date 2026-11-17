import { afterEach, expect, it, vi } from "vitest";
import { ServerClient, ServerError } from "../src/io/server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("times out a request that never receives a response", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ),
  );
  const result = new ServerClient("https://server").session();
  const checked = expect(result).rejects.toMatchObject({ status: 0 });
  await vi.advanceTimersByTimeAsync(30_000);
  await checked;
  expect(vi.getTimerCount()).toBe(0);
});

it("reports a network error if the response body fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      text: async () => {
        throw new Error("Connection lost");
      },
    })),
  );
  await expect(new ServerClient("https://server").session()).rejects.toBeInstanceOf(ServerError);
});

it("calls the API next to the app, with the cookie of the session", async () => {
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await new ServerClient("https://server/").plans();
  expect(fetch).toHaveBeenCalledWith(
    "https://server/api/plans",
    expect.objectContaining({ credentials: "same-origin" }),
  );
  expect(new ServerClient("https://server").address("/s/abc")).toBe("https://server/s/abc");
});

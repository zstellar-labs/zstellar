import { describe, expect, it } from "vitest";
import { POST } from "../app/api/relay/route";

function relayRequest(
  host: string,
  init: {
    origin?: string;
    fetchSite?: string;
    forwardedFor?: string;
    body?: unknown;
  },
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.origin) headers.set("origin", init.origin);
  if (init.fetchSite) headers.set("sec-fetch-site", init.fetchSite);
  if (init.forwardedFor) headers.set("x-forwarded-for", init.forwardedFor);
  return new Request(`https://${host}/api/relay`, {
    method: "POST",
    headers,
    body: JSON.stringify(init.body ?? { txXdr: "AAAA" }),
  });
}

describe("POST /api/relay origin checks", () => {
  it("rejects a foreign Origin with 403 before any signing", async () => {
    const res = await POST(
      relayRequest("app.example", { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a same-host Origin with a different scheme", async () => {
    const res = await POST(
      relayRequest("app-scheme.example", {
        origin: "http://app-scheme.example",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects Sec-Fetch-Site: cross-site with 403", async () => {
    const res = await POST(
      relayRequest("app2.example", { fetchSite: "cross-site" }),
    );
    expect(res.status).toBe(403);
  });

  it("does not reject a same-origin request for its origin", async () => {
    const res = await POST(
      relayRequest("own.example", { origin: "https://own.example" }),
    );
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(429);
  });
});

describe("POST /api/relay rate limiting", () => {
  it("throttles repeated requests with 429", async () => {
    const host = "ratelimit.example";
    for (let i = 0; i < 10; i++) {
      const res = await POST(
        relayRequest(host, { origin: `https://${host}` }),
      );
      expect(res.status).not.toBe(429);
    }
    const res = await POST(relayRequest(host, { origin: `https://${host}` }));
    expect(res.status).toBe(429);
  });
});

describe("POST /api/relay authEntries caps", () => {
  it("rejects more than 20 auth entries with 413", async () => {
    const res = await POST(
      relayRequest("caps-count.example", {
        origin: "https://caps-count.example",
        body: { txXdr: "AAAA", authEntries: new Array(21).fill("AAAA") },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects an oversized authEntries payload with 413", async () => {
    const res = await POST(
      relayRequest("caps-size.example", {
        origin: "https://caps-size.example",
        body: { txXdr: "AAAA", authEntries: ["A".repeat(40 * 1024)] },
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects non-string authEntries entries with 400", async () => {
    const res = await POST(
      relayRequest("caps-type.example", {
        origin: "https://caps-type.example",
        body: { txXdr: "AAAA", authEntries: [123] },
      }),
    );
    expect(res.status).toBe(400);
  });
});

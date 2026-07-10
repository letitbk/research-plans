import { describe, it, expect, vi, beforeEach } from "vitest";

const store: Record<string, unknown> = {};
vi.mock("../lib/blobstore", () => ({
  putComment: vi.fn(async (_t: string, c: any) => { store[c.id] = c; }),
  listComments: vi.fn(async () => Object.values(store)),
}));

import { GET, POST } from "./comments";

const SECRET = "sess";
beforeEach(() => { for (const k of Object.keys(store)) delete store[k];
  process.env.BOARD_SESSION_SECRET = SECRET; process.env.BOARD_PULL_KEY = "pull-1";
  process.env.BLOB_READ_WRITE_TOKEN = "tok"; });

const goodBody = {
  id: "11111111-1111-4111-8111-111111111111", clientId: "c1", author: "Ada",
  shareHash: "h1", annotation: { type: "doc-comment", view: "tracker", quote: "q", comment: "c" },
};
const authHeaders = { "x-board-key": "pull-1", "content-type": "application/json" };

describe("POST /api/comments", () => {
  it("401 JSON without auth (never HTML)", async () => {
    const res = await POST(new Request("https://x/api/comments", {
      method: "POST", body: JSON.stringify(goodBody), headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
  it("stores an authed comment (upsert by id)", async () => {
    const req = () => new Request("https://x/api/comments", {
      method: "POST", body: JSON.stringify(goodBody), headers: authHeaders });
    expect((await POST(req())).status).toBe(200);
    await POST(req()); // retry same id → no duplicate
    expect(Object.keys(store).length).toBe(1);
  });
  it("400 on invalid body", async () => {
    const bad = { ...goodBody, annotation: { type: "verdict" } };
    const res = await POST(new Request("https://x/api/comments", {
      method: "POST", body: JSON.stringify(bad), headers: authHeaders }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/comments", () => {
  it("401 JSON without auth", async () => {
    const res = await GET(new Request("https://x/api/comments"));
    expect(res.status).toBe(401);
  });
  it("returns stored comments to an authed reader, no blob urls", async () => {
    await POST(new Request("https://x/api/comments", { method: "POST",
      body: JSON.stringify(goodBody), headers: authHeaders }));
    const res = await GET(new Request("https://x/api/comments", { headers: { "x-board-key": "pull-1" } }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.comments.length).toBe(1);
    expect(JSON.stringify(json)).not.toContain("blob.vercel-storage.com");
  });
});

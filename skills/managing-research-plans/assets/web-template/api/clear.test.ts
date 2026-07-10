import { describe, it, expect, vi, beforeEach } from "vitest";

const { list, del } = vi.hoisted(() => ({
  list: vi.fn(),
  del: vi.fn(async (_url: string, _options: Record<string, unknown>) => {}),
}));
vi.mock("@vercel/blob", () => ({ list, del }));

import { POST } from "./clear";

const SECRET = "sess";
beforeEach(() => {
  list.mockReset();
  del.mockClear();
  process.env.BOARD_SESSION_SECRET = SECRET;
  process.env.BOARD_PULL_KEY = "pull-1";
  process.env.BLOB_READ_WRITE_TOKEN = "tok";
});

const authHeaders = { "x-board-key": "pull-1" };

describe("POST /api/clear", () => {
  it("401 JSON without auth (never HTML), and deletes nothing", async () => {
    const res = await POST(new Request("https://x/api/clear", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(del).not.toHaveBeenCalled();
  });

  it("deletes every comments/ blob when authed with the pull key", async () => {
    list.mockResolvedValue({
      blobs: [
        { url: "https://x.blob.vercel-storage.com/comments/1.json" },
        { url: "https://x.blob.vercel-storage.com/comments/2.json" },
      ],
      hasMore: false,
    });
    const res = await POST(new Request("https://x/api/clear", { method: "POST", headers: authHeaders }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, deleted: 2 });
    expect(del).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ token: "tok", prefix: "comments/" }));
  });

  it("paginates across multiple list() pages", async () => {
    list.mockResolvedValueOnce({
      blobs: [{ url: "https://x.blob.vercel-storage.com/comments/1.json" }],
      hasMore: true,
      cursor: "c1",
    });
    list.mockResolvedValueOnce({
      blobs: [{ url: "https://x.blob.vercel-storage.com/comments/2.json" }],
      hasMore: false,
    });
    const res = await POST(new Request("https://x/api/clear", { method: "POST", headers: authHeaders }));
    expect(list).toHaveBeenCalledTimes(2);
    const json = await res.json();
    expect(json.deleted).toBe(2);
  });
});

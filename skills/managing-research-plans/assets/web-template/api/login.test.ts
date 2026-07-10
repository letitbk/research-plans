import { describe, it, expect, beforeEach } from "vitest";
import { POST as login } from "./login";
import { POST as logout } from "./logout";

beforeEach(() => { process.env.BOARD_PASSWORD = "correct-horse";
  process.env.BOARD_SESSION_SECRET = "sess"; });

async function form(pw: string): Promise<Request> {
  return new Request("https://x/api/login", { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: pw }).toString() });
}

describe("login", () => {
  it("sets a cookie and redirects on correct password", async () => {
    const res = await login(await form("correct-horse"));
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("board_session=");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("re-serves the login page (no cookie) on wrong password", async () => {
    const res = await login(await form("wrong"));
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.status).toBe(401);
  });
});

describe("logout", () => {
  it("clears the cookie", async () => {
    const res = await logout(new Request("https://x/api/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});

import { isAuthed } from "./lib/auth";
import { gateDecision, SECURITY_HEADERS } from "./lib/gate";
import { loginPageHtml } from "./lib/loginPage";

export const config = { runtime: "nodejs", matcher: "/((?!_next|favicon).*)" };

export default function middleware(request: Request): Response | undefined {
  const url = new URL(request.url);
  const now = Math.floor(Date.now() / 1000);
  const authed = isAuthed(process.env as Record<string, string>, request.headers, now);
  const decision = gateDecision(url.pathname, request.method, authed);
  if (decision.action === "allow") return undefined; // continue to the route
  if (decision.action === "unauthorizedJson") {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", ...SECURITY_HEADERS },
    });
  }
  return new Response(loginPageHtml(), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
  });
}

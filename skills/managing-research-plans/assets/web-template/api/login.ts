import { signCookie, cookieHeader, clearCookieHeader, timingSafeEqualStr } from "../lib/auth";
import { SECURITY_HEADERS } from "../lib/gate";
import { loginPageHtml } from "../lib/loginPage";

export async function POST(request: Request): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  let pw = "";
  try {
    const form = await request.formData();
    pw = String(form.get("password") ?? "");
  } catch { /* fallthrough to failure */ }
  const expected = process.env.BOARD_PASSWORD ?? "";
  if (expected && timingSafeEqualStr(pw, expected)) {
    const cookie = signCookie(process.env.BOARD_SESSION_SECRET as string, now);
    return new Response(null, {
      status: 303,
      headers: { location: "/", "set-cookie": cookieHeader(cookie), ...SECURITY_HEADERS },
    });
  }
  return new Response(loginPageHtml(), {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
  });
}

export const config = { runtime: "nodejs" };

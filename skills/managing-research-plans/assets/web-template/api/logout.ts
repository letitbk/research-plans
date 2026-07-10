import { clearCookieHeader } from "../lib/auth";
import { SECURITY_HEADERS } from "../lib/gate";

export async function POST(_request: Request): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clearCookieHeader(), ...SECURITY_HEADERS },
  });
}

export const config = { runtime: "nodejs" };

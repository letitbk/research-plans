import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clearCookieHeader } from "../lib/auth";
import { SECURITY_HEADERS } from "../lib/gate";

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.status(200).json({ ok: true });
}

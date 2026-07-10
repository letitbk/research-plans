import { isAuthed } from "../lib/auth";
import { SECURITY_HEADERS } from "../lib/gate";
import { list, del } from "@vercel/blob";

export async function POST(request: Request): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  if (!isAuthed(process.env as Record<string, string>, request.headers, now)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { "content-type": "application/json", ...SECURITY_HEADERS } });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN as string;
  let cursor: string | undefined, n = 0;
  do {
    const page = await list({ token, prefix: "comments/", cursor, limit: 1000 });
    for (const b of page.blobs) { await del(b.url, { token }); n++; }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return new Response(JSON.stringify({ ok: true, deleted: n }), {
    status: 200, headers: { "content-type": "application/json", ...SECURITY_HEADERS } });
}
export const config = { runtime: "nodejs" };

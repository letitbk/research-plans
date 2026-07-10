import { isAuthed } from "../lib/auth";
import { validateCommentBody } from "../lib/validate";
import { SECURITY_HEADERS } from "../lib/gate";
import { putComment, listComments, type StoredComment } from "../lib/blobstore";

const JSON_HEADERS = { "content-type": "application/json", ...SECURITY_HEADERS };
const now = () => Math.floor(Date.now() / 1000);

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthed(process.env as Record<string, string>, request.headers, now())) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: JSON_HEADERS }); }
  const v = validateCommentBody(body);
  if (!v.ok) return new Response(JSON.stringify({ error: "invalid", detail: v.error }), { status: 400, headers: JSON_HEADERS });
  const stored: StoredComment = {
    id: v.value.id, clientId: v.value.clientId, author: v.value.author,
    shareHash: v.value.shareHash, docHash: v.value.docHash ?? null,
    annotation: v.value.annotation, receivedAt: new Date().toISOString(),
  };
  await putComment(process.env.BLOB_READ_WRITE_TOKEN as string, stored);
  return new Response(JSON.stringify({ ok: true, id: stored.id }), { status: 200, headers: JSON_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthed(process.env as Record<string, string>, request.headers, now())) return unauthorized();
  const comments = await listComments(process.env.BLOB_READ_WRITE_TOKEN as string);
  return new Response(JSON.stringify({ comments }), { status: 200, headers: JSON_HEADERS });
}

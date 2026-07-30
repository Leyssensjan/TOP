import { checkKey } from '@/lib/auth';
import { NotionError } from '@/lib/store/notion';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Auth, body parsing and error shaping in one place, so routes stay readable. */
export async function handle<T>(
  req: Request,
  fn: (body: any) => Promise<T>,
): Promise<Response> {
  const auth = checkKey(req);
  if (!auth.ok) return json({ error: auth.message }, auth.status);

  let body: any = {};
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const text = await req.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      return json({ error: 'Body is not valid JSON' }, 400);
    }
  }

  try {
    return json(await fn(body));
  } catch (err) {
    if (err instanceof BadRequest) {
      return json({ error: err.message, retryable: false }, 400);
    }
    if (err instanceof NotionError) {
      // 5xx from Notion is worth retrying from the client queue; 4xx is not.
      return json({ error: err.message, code: err.code, retryable: err.status >= 500 }, err.status >= 500 ? 502 : err.status);
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return json({ error: message, retryable: false }, 500);
  }
}

export class BadRequest extends Error {}

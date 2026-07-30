import { timingSafeEqual } from 'node:crypto';

export const KEY_HEADER = 'x-flowquest-key';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * One shared secret, no login and no accounts. The key travels in a header,
 * or in ?k= on the very first visit so a bookmark is enough to get in.
 */
export function checkKey(req: Request): { ok: true } | { ok: false; status: number; message: string } {
  const expected = process.env.FLOWQUEST_SECRET;
  if (!expected) {
    return { ok: false, status: 500, message: 'FLOWQUEST_SECRET is not set on the server' };
  }

  const header = req.headers.get(KEY_HEADER);
  const url = new URL(req.url);
  const query = url.searchParams.get('k');
  const provided = header || query;

  if (!provided) return { ok: false, status: 401, message: 'Missing key' };
  if (!safeEqual(provided, expected)) return { ok: false, status: 401, message: 'Bad key' };
  return { ok: true };
}

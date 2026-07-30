import { MemoryStore } from '@/lib/store/memory';
import { NotionStore } from '@/lib/store/notion';
import type { Store } from '@/lib/types';

let cached: Store | null = null;

/**
 * The single line that decides where data lives. Swapping Notion for another
 * database is a new file implementing Store plus one change here.
 *
 * FLOWQUEST_STORE=memory is for local curl testing only. There is no implicit
 * fallback: if the token is missing in production the request fails loudly
 * rather than quietly serving fake data.
 */
export function getStore(): Store {
  if (!cached) {
    cached = process.env.FLOWQUEST_STORE === 'memory' ? new MemoryStore() : new NotionStore();
  }
  return cached;
}

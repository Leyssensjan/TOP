import { handle } from '@/lib/api';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads the scouted routes. Section 12 is explicit that these are hardcoded in
 * Notion rather than generated, so this endpoint only ever reads.
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const store = getStore();
    const routes = await store.getRoutes();
    return {
      routes,
      scouted: routes.length > 0,
      note: routes.length
        ? null
        : 'No routes scouted yet. Add them to the Routes database in Notion.',
      store: store.name,
    };
  });
}

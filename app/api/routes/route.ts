import { handle } from '@/lib/api';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stubbed on purpose. The Routes table stays empty until three runs from
 * Berouw are scouted at roughly 3, 5 and 8 km, and section 12 is explicit that
 * they get hardcoded rather than generated. This reads whatever is there and
 * says plainly when there is nothing.
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
        : 'No routes scouted yet. Engine sessions have no route until Coupure, Bourgoyen-Ossemeersen and the ring canal towpaths are walked and added to Notion.',
      store: store.name,
    };
  });
}

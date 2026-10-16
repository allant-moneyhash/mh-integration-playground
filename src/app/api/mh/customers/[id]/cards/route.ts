// A customer's saved card tokens, unfiltered (GET /customers/{id}/cards/).
// Unlike the SDK's getMethods, this lists every card on the customer and gives
// each token's UUID `id`, which is what card_token must be for a merchant-
// initiated charge (the SDK's savedCards ids are short hashids).
// Docs: https://docs.moneyhash.io/reference/get-customer-saved-cards
import { RequestError, assertNotKnownLive, errorResponse, mhCall, parseTarget, resolveApiKey } from '@/lib/server/mh';

const UUID = /^[0-9a-f-]{32,36}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!UUID.test(id)) throw new RequestError(400, 'That customer ID does not look like a MoneyHash customer UUID.');
    const url = new URL(req.url);
    const target = parseTarget(url.searchParams.get('env'), url.searchParams.get('apiVersion'));
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);
    const result = await mhCall({
      target,
      apiKey,
      method: 'GET',
      path: `/customers/${encodeURIComponent(id)}/cards/?limit=50`,
      title: 'List customer cards',
    });
    return Response.json({ ok: result.ok, status: result.status, data: result.data, entries: [result.entry] }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return errorResponse(err);
  }
}

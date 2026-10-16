// Agreement lookup (GET /agreements/{agreement_id}/): whether a recurring /
// unscheduled agreement set up by a customer-present payment (CIT) is active per
// provider, so the store can decide between MIT and a new CIT before charging.
// Used before each stored-card payment to choose between MIT and a new CIT.
import {
  RequestError,
  assertNotKnownLive,
  errorResponse,
  mhCall,
  parseTarget,
  resolveApiKey,
} from '@/lib/server/mh';

const AGREEMENT = /^[A-Za-z0-9_.:-]{1,128}$/;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!AGREEMENT.test(id))
      throw new RequestError(400, 'That agreement ID does not look right.');
    const url = new URL(req.url);
    const target = parseTarget(
      url.searchParams.get('env'),
      url.searchParams.get('apiVersion'),
    );
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);
    const result = await mhCall({
      target,
      apiKey,
      method: 'GET',
      path: `/agreements/${encodeURIComponent(id)}/`,
      title: 'Get agreement',
    });
    // 404 is a normal answer here ("no agreement yet"), so pass the status through.
    return Response.json(
      {
        ok: result.ok,
        status: result.status,
        data: result.data,
        entries: [result.entry],
      },
      { status: 200 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

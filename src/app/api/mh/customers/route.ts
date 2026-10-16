// Create a MoneyHash customer (POST /customers/), used by the saved-card flow.
import {
  RequestError,
  assertNotKnownLive,
  errorResponse,
  mhCall,
  parseTarget,
  resolveApiKey,
} from '@/lib/server/mh';

const ALLOWED = [
  'first_name',
  'last_name',
  'email',
  'phone_number',
  'description',
] as const;

export async function POST(req: Request) {
  try {
    const input = (await req.json().catch(() => null)) as {
      env?: unknown;
      apiVersion?: unknown;
      customer?: Record<string, unknown>;
    } | null;
    if (!input?.customer || typeof input.customer !== 'object')
      throw new RequestError(400, 'Customer details are required.');
    const target = parseTarget(input.env, input.apiVersion);
    const apiKey = resolveApiKey(req, target.env);
    assertNotKnownLive(apiKey);

    const body: Record<string, unknown> = { type: 'INDIVIDUAL' };
    for (const k of ALLOWED)
      if (typeof input.customer[k] === 'string' && input.customer[k])
        body[k] = input.customer[k];

    const result = await mhCall({
      target,
      apiKey,
      method: 'POST',
      path: '/customers/',
      body,
      title: 'Create customer',
    });
    return Response.json(
      {
        ok: result.ok,
        status: result.status,
        data: result.data,
        entries: [result.entry],
      },
      { status: result.ok ? 200 : 502 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}

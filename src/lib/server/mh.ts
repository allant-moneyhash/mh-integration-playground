// Server-only MoneyHash client. Secret keys are read here and nowhere else.
import { createHash, randomUUID } from 'node:crypto';
import {
  ENVIRONMENTS,
  isApiVersion,
  isEnvId,
  type ApiVersion,
  type EnvId,
} from '@/lib/hosts';
import { maskDeep } from '@/lib/mask';
import type { ConsoleEntry } from '@/lib/console-types';

export class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public entries: ConsoleEntry[] = [],
  ) {
    super(message);
  }
}

export type Target = { env: EnvId; version: ApiVersion };

export function parseTarget(env: unknown, version: unknown): Target {
  if (!isEnvId(env)) throw new RequestError(400, 'Unknown environment.');
  if (!isApiVersion(version))
    throw new RequestError(400, 'Unsupported API version.');
  return { env, version };
}

const ENV_KEY_NAME: Record<EnvId, string> = {
  staging: 'MH_STAGING_API_KEY',
  production: 'MH_PRODUCTION_API_KEY',
};

/** A key typed in the UI wins; otherwise the demo account key from env vars. */
export function resolveApiKey(req: Request, env: EnvId): string {
  const fromUi = req.headers.get('x-mh-api-key')?.trim();
  if (fromUi) return fromUi;
  const fromEnv = process.env[ENV_KEY_NAME[env]]?.trim();
  if (fromEnv) return fromEnv;
  throw new RequestError(
    400,
    // ENV_KEY_NAME is the server env variable that would hold the deployment's own key.
    `No API key for ${ENVIRONMENTS[env].label}. Add your secret and public keys in Config (top right). Demo keys are not set on this deployment yet (${ENV_KEY_NAME[env]}).`,
  );
}

// ---------- Sandbox-only guard ----------
// MoneyHash keys don't reveal their mode, but every intent response carries
// `is_live`. Creating an intent moves no money, so we create, check, and close
// straight away if it is live. Keys seen as live are refused from then on.
const liveKeyFingerprints = new Set<string>();
const fingerprint = (key: string) =>
  createHash('sha256').update(key).digest('hex');

export const LIVE_KEY_MESSAGE =
  'Live-mode keys are switched off on this deployment (MH_BLOCK_LIVE_KEYS). The intent was closed. Use a test-mode key.';

export function assertNotKnownLive(key: string) {
  if (!liveAllowed() && liveKeyFingerprints.has(fingerprint(key)))
    throw new RequestError(403, LIVE_KEY_MESSAGE);
}

/**
 * Live-mode keys are allowed by default. Set MH_BLOCK_LIVE_KEYS=true to refuse
 * them, e.g. on a public deployment.
 */
export function liveAllowed() {
  return process.env.MH_BLOCK_LIVE_KEYS !== 'true';
}

/** Shown on the create-intent console entry when MoneyHash reports a live intent. */
export const LIVE_NOTE =
  'LIVE MODE: is_live is true, so this intent can move real money.';

export function isLiveResponse(data: unknown): boolean {
  const d = (data as { data?: Record<string, unknown> })?.data;
  if (!d) return false;
  const intent = (d.intent ?? d) as Record<string, unknown>;
  return intent.is_live === true || d.is_live === true;
}

export function rememberLiveKey(key: string) {
  liveKeyFingerprints.add(fingerprint(key));
}

// ---------- The one function that talks to MoneyHash ----------
type CallInput = {
  target: Target;
  apiKey: string;
  method: 'GET' | 'POST';
  /** Path after /api/{version}, e.g. "/payments/intent/". */
  path: string;
  body?: unknown;
  title: string;
  /** A full MoneyHash URL instead of path (Direct API vault URL). The caller must validate its host. */
  url?: string;
};

export type CallResult = {
  entry: ConsoleEntry;
  data: unknown;
  ok: boolean;
  status: number;
};

export async function mhCall({
  target,
  apiKey,
  method,
  path,
  body,
  title,
  url: absolute,
}: CallInput): Promise<CallResult> {
  const url =
    absolute ?? `${ENVIRONMENTS[target.env].api}/api/${target.version}${path}`;
  const headers: Record<string, string> = {
    'x-api-key': apiKey,
    accept: 'application/json',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['x-idempotency-key'] = randomUUID();

  const started = performance.now();
  let status = 0;
  let data: unknown = null;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
    status = res.status;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
  } catch (err) {
    data = {
      error:
        err instanceof Error && err.name === 'TimeoutError'
          ? 'MoneyHash did not answer within 20s'
          : 'Could not reach MoneyHash',
    };
  }
  const latencyMs = Math.round(performance.now() - started);
  const ok = status >= 200 && status < 300;

  const entry: ConsoleEntry = {
    id: randomUUID(),
    ts: Date.now(),
    source: 'Backend API',
    title,
    method,
    // Vault URLs carry a short-lived token in the query string.
    endpoint: maskDeep(url),
    request: { headers: maskDeep(headers), body: maskDeep(body) },
    status,
    latencyMs,
    response: maskDeep(data),
    ok,
  };
  return { entry, data, ok, status };
}

export function errorResponse(err: unknown) {
  if (err instanceof RequestError) {
    return Response.json(
      { error: err.message, entries: err.entries },
      { status: err.status },
    );
  }
  // Never echo raw errors: they could carry request details.
  console.error(
    'Unexpected server error',
    err instanceof Error ? err.name : 'unknown',
  );
  return Response.json(
    { error: 'Something went wrong on the playground server.' },
    { status: 500 },
  );
}

// Demo account public keys for the SDK flows. Public keys are meant for the
// browser (they can only start client-side calls), so serving them is fine.
import { isEnvId } from '@/lib/hosts';

const NAMES = {
  staging: 'MH_STAGING_PUBLIC_KEY',
  production: 'MH_PRODUCTION_PUBLIC_KEY',
} as const;

export async function GET(req: Request) {
  const env = new URL(req.url).searchParams.get('env');
  if (!isEnvId(env))
    return Response.json({ error: 'Unknown environment.' }, { status: 400 });
  return Response.json({
    publicApiKey: process.env[NAMES[env]]?.trim() || null,
  });
}

// MoneyHash hosts per environment. The server only ever calls these hosts;
// the browser never chooses a URL.
export const ENVIRONMENTS = {
  staging: {
    label: 'Staging',
    api: 'https://staging-web.moneyhash.io',
    embed: 'https://stg-embed.moneyhash.io',
    vault: 'https://vault-staging.moneyhash.io',
    vaultForm: 'https://vault-staging-form.moneyhash.io',
  },
  production: {
    label: 'Production',
    api: 'https://web.moneyhash.io',
    embed: 'https://embed.moneyhash.io',
    vault: 'https://vault.moneyhash.io',
    vaultForm: 'https://vault-form.moneyhash.io',
  },
} as const;

export type EnvId = keyof typeof ENVIRONMENTS;
export const ENV_IDS = Object.keys(ENVIRONMENTS) as EnvId[];

export const API_VERSIONS = ['v1.1', 'v1.2', 'v1.3', 'v1.4'] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];
export const DEFAULT_API_VERSION: ApiVersion = 'v1.4';

export function isEnvId(v: unknown): v is EnvId {
  return typeof v === 'string' && v in ENVIRONMENTS;
}

export function isApiVersion(v: unknown): v is ApiVersion {
  return (
    typeof v === 'string' && (API_VERSIONS as readonly string[]).includes(v)
  );
}

'use client';
// Named scenarios saved in this browser (localStorage). A preset can keep the
// account's API keys so it can be reused, but only here: keys sit beside the
// scenario data, never inside it, so share links (built from the data) never
// carry them, and secret-looking fields in hand edits are still stripped.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSensitiveKey } from '@/lib/mask';
import type { ApiVersion, EnvId } from '@/lib/hosts';
import type { Currency } from '@/lib/catalog';
import type { IntentPatch } from '@/lib/intent-body';
import type { EmbedOptionValues } from './config';
import { CURRENCIES } from '@/lib/catalog';
import { API_VERSIONS, ENV_IDS } from '@/lib/hosts';
import {
  DEFAULT_SELECTION,
  fromLegacyFlowId,
  normalise,
  type Selection,
} from '@/flows/selection';

export type PresetData = {
  /** Backend API, checkout experience and settings. */
  selection: Selection;
  /** Optional dashboard flow sent as flow_id. */
  paymentFlowId?: string;
  env: EnvId;
  apiVersion: ApiVersion;
  useIntentSecret: boolean;
  currency: Currency;
  embedOptions: EmbedOptionValues;
  intentPatch: IntentPatch;
  /** Console edits to SDK calls, per method. */
  sdkEdits?: Record<string, IntentPatch>;
};

/** The account keys a preset reuses. Local to this browser; never in a share link. */
export type PresetKeys = { apiKey: string; publicApiKey: string };

export type Preset = {
  name: string;
  savedAt: number;
  data: PresetData;
  keys?: PresetKeys;
};

function stripSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !isSensitiveKey(k))
        .map(([k, v]) => [k, stripSecrets(v)]),
    );
  }
  return value;
}

export function sanitisePreset(data: PresetData): PresetData {
  return {
    selection: normalise(data.selection ?? DEFAULT_SELECTION),
    paymentFlowId:
      typeof data.paymentFlowId === 'string'
        ? data.paymentFlowId.trim().slice(0, 64)
        : '',
    env: data.env,
    apiVersion: data.apiVersion,
    useIntentSecret: data.useIntentSecret,
    currency: data.currency,
    embedOptions: stripSecrets(data.embedOptions) as EmbedOptionValues,
    intentPatch: {
      set: stripSecrets(data.intentPatch.set) as Record<string, unknown>,
      removed: data.intentPatch.removed,
    },
    sdkEdits: Object.fromEntries(
      Object.entries(data.sdkEdits ?? {}).map(([m, p]) => [
        m,
        {
          set: stripSecrets(p?.set ?? {}) as Record<string, unknown>,
          removed: Array.isArray(p?.removed) ? p.removed : [],
        },
      ]),
    ),
  };
}

type PresetState = {
  presets: Preset[];
  save: (name: string, data: PresetData, keys?: PresetKeys) => void;
  remove: (name: string) => void;
};

export const usePresets = create<PresetState>()(
  persist(
    set => ({
      presets: [],
      save: (name, data, keys) =>
        set(s => ({
          presets: [
            ...s.presets.filter(p => p.name !== name),
            {
              name,
              savedAt: Date.now(),
              data: sanitisePreset(data),
              ...(keys && (keys.apiKey || keys.publicApiKey) ? { keys } : {}),
            },
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })),
      remove: name =>
        set(s => ({ presets: s.presets.filter(p => p.name !== name) })),
    }),
    {
      name: 'mh-playground-presets',
      version: 2,
      // v1 presets stored a flowId.
      migrate: (persisted, version) => {
        const old = (persisted ?? { presets: [] }) as {
          presets?: {
            name: string;
            savedAt: number;
            data: Record<string, unknown>;
          }[];
        };
        if (version >= 2) return old as PresetState;
        return {
          presets: (old.presets ?? []).map(p => {
            const { flowId, ...rest } = p.data;
            return {
              ...p,
              data: {
                ...rest,
                selection: fromLegacyFlowId(
                  typeof flowId === 'string' ? flowId : '',
                ),
              } as PresetData,
            };
          }),
        } as PresetState;
      },
    },
  ),
);

/**
 * Share links carry a preset in the URL (?setup=…). They never include keys: the
 * data is sanitised on the way out and again on the way in.
 */
export function encodePreset(data: PresetData): string {
  const json = JSON.stringify(sanitisePreset(data));
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodePreset(value: string): PresetData | null {
  try {
    const json = decodeURIComponent(
      escape(atob(value.replace(/-/g, '+').replace(/_/g, '/'))),
    );
    const d = JSON.parse(json) as Partial<PresetData>;
    if (!d || typeof d !== 'object') return null;
    return sanitisePreset({
      selection: normalise({ ...DEFAULT_SELECTION, ...(d.selection ?? {}) }),
      paymentFlowId: typeof d.paymentFlowId === 'string' ? d.paymentFlowId : '',
      env: ENV_IDS.includes(d.env as never)
        ? (d.env as PresetData['env'])
        : 'staging',
      apiVersion: API_VERSIONS.includes(d.apiVersion as never)
        ? (d.apiVersion as PresetData['apiVersion'])
        : 'v1.4',
      useIntentSecret: d.useIntentSecret !== false,
      currency: CURRENCIES.includes(d.currency as never)
        ? (d.currency as PresetData['currency'])
        : 'AED',
      embedOptions: (d.embedOptions ?? {}) as EmbedOptionValues,
      intentPatch: {
        set: (d.intentPatch?.set ?? {}) as Record<string, unknown>,
        removed: Array.isArray(d.intentPatch?.removed)
          ? d.intentPatch!.removed
          : [],
      },
      sdkEdits: d.sdkEdits && typeof d.sdkEdits === 'object' ? d.sdkEdits : {},
    });
  } catch {
    return null;
  }
}

'use client';
import { useState } from 'react';
import { Link2, Settings, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  SheetContent,
} from '@/components/ui/overlays';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  API_VERSIONS,
  ENVIRONMENTS,
  ENV_IDS,
  type ApiVersion,
} from '@/lib/hosts';
import { CURRENCIES, type Currency } from '@/lib/catalog';
import { useConfig } from '@/store/config';
import { useKeys } from '@/store/keys';
import { useCart } from '@/store/cart';
import { encodePreset, usePresets, type PresetData } from '@/store/presets';

export function ConfigSheet() {
  const cfg = useConfig();
  const keys = useKeys();
  const { currency, setCurrency } = useCart();
  const { presets, save, remove } = usePresets();
  const [presetName, setPresetName] = useState('');

  const current = (): PresetData => ({
    selection: cfg.selection,
    paymentFlowId: cfg.paymentFlowId,
    env: cfg.env,
    apiVersion: cfg.apiVersion,
    useIntentSecret: cfg.useIntentSecret,
    currency,
    embedOptions: cfg.embedOptions,
    intentPatch: cfg.intentPatch,
    sdkEdits: cfg.sdkEdits,
  });

  /** A link that opens the checkout with this setup. Keys are never part of it. */
  function copyLink(data: PresetData, name?: string) {
    const url = new URL('/checkout', window.location.origin);
    url.searchParams.set('setup', encodePreset(data));
    if (name) url.searchParams.set('name', name);
    navigator.clipboard.writeText(url.toString());
    toast.success('Share link copied (no keys included)');
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const withKeys = !!(keys.apiKey || keys.publicApiKey);
    save(
      name,
      current(),
      withKeys
        ? { apiKey: keys.apiKey, publicApiKey: keys.publicApiKey }
        : undefined,
    );
    setPresetName('');
    toast.success(
      withKeys
        ? `Saved "${name}" with its API keys (this browser only)`
        : `Saved "${name}" (demo account, no keys)`,
    );
  }

  function loadPreset(name: string) {
    const p = presets.find(x => x.name === name);
    if (!p) return;
    const { currency: c, ...rest } = p.data;
    cfg.set({ ...rest, sdkEdits: rest.sdkEdits ?? {} });
    setCurrency(c);
    // A preset saved with keys switches to that account; one without uses the demo account.
    if (p.keys) keys.setKeys(p.keys);
    else keys.clearKeys();
    toast.success(
      p.keys
        ? `Loaded "${name}" with its API keys`
        : `Loaded "${name}" on the demo account`,
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="size-3.5" />
          Config
        </Button>
      </DialogTrigger>
      <SheetContent>
        <div className="border-b p-6">
          <DialogTitle className="text-lg font-semibold">Config</DialogTitle>
          <DialogDescription className="text-sm text-subtle">
            Applies to every flow. Saved in this browser, except keys.
          </DialogDescription>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto p-6">
          <Section
            title="Environment"
            help="Use keys from the matching MoneyHash environment. Live-mode keys work in both; the console flags LIVE MODE whenever an intent can move real money."
          >
            <div className="grid grid-cols-2 gap-2">
              {ENV_IDS.map(id => (
                <Button
                  key={id}
                  variant={cfg.env === id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => cfg.set({ env: id })}
                >
                  {ENVIRONMENTS[id].label}
                </Button>
              ))}
            </div>
          </Section>

          <div className="grid grid-cols-2 gap-4">
            <Section title="API version">
              <Select
                value={cfg.apiVersion}
                onValueChange={v => cfg.set({ apiVersion: v as ApiVersion })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {API_VERSIONS.map(v => (
                    <SelectItem key={v} value={v}>
                      {v}
                      {v === 'v1.4' ? ' (latest)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Section>
            <Section title="Currency">
              <Select
                value={currency}
                onValueChange={v => setCurrency(v as Currency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Section>
          </div>

          <Section
            title="Use intent secret"
            help="On: the browser proves it may act on the intent (setIntentSecret, mh_intent_secret). Off: it doesn't, so accounts with “Require Intent Secret” return 401. Server calls with your API key never need it."
          >
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={cfg.useIntentSecret}
                onCheckedChange={v => cfg.set({ useIntentSecret: v })}
              />
              {cfg.useIntentSecret ? 'On' : 'Off'}
            </label>
          </Section>

          <Section
            title="API keys (optional)"
            help="Leave empty to use the demo account. Keys you type are kept for this tab (or saved with a preset, in this browser only), go to our server per request, and are never shown unmasked."
          >
            <div className="space-y-3">
              <Input
                label="Account API key (secret)"
                type="password"
                autoComplete="off"
                value={keys.apiKey}
                onChange={e => keys.setKeys({ apiKey: e.target.value })}
              />
              <Input
                label="Public API key (for SDK flows)"
                type="password"
                autoComplete="off"
                value={keys.publicApiKey}
                onChange={e => keys.setKeys({ publicApiKey: e.target.value })}
              />
              {(keys.apiKey || keys.publicApiKey) && (
                <Button variant="ghost" size="sm" onClick={keys.clearKeys}>
                  Use demo account instead
                </Button>
              )}
            </div>
          </Section>

          <Section
            title="Presets"
            help="Save a setup (API, experience, settings, currency, options and intent JSON edits) to reproduce a merchant's scenario, or share it as a link. API keys typed above are saved with the preset in this browser only, so loading it switches to that account. Share links never include keys: whoever opens one adds their own."
          >
            <div className="flex gap-2">
              <Input
                label="Preset name"
                containerClassName="flex-1"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && savePreset()}
              />
              <Button
                onClick={savePreset}
                disabled={!presetName.trim()}
                className="h-10"
              >
                Save
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyLink(current())}
            >
              <Link2 className="size-3.5" /> Copy a link to the current setup
            </Button>
            {presets.length > 0 && (
              <ul className="mt-3 divide-y rounded-md border">
                {presets.map(p => (
                  <li
                    key={p.name}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <span className="flex-1 truncate">
                      {p.name}
                      <span className="ms-2 text-xs text-subtler">
                        {p.keys
                          ? `${p.data.env === 'production' ? 'Production' : 'Staging'} keys`
                          : 'Demo account'}
                      </span>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadPreset(p.name)}
                    >
                      Load
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy a link to ${p.name}`}
                      title="Copy share link"
                      onClick={() => copyLink(p.data, p.name)}
                    >
                      <Link2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => remove(p.name)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Dialog>
  );
}

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-bolder">{title}</h3>
      {help && <p className="text-xs text-subtle">{help}</p>}
      {children}
    </section>
  );
}

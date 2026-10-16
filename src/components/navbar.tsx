'use client';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { CURRENCIES, type Currency } from '@/lib/catalog';
import {
  API_VERSIONS,
  ENV_IDS,
  type ApiVersion,
  type EnvId,
} from '@/lib/hosts';
import { useCart } from '@/store/cart';
import { useConfig } from '@/store/config';
import { useHydrated } from '@/lib/use-hydrated';
import { MoneyHashLogo } from './logo';
import { CartPopover } from './cart-popover';
import { ThemeToggle } from './theme-toggle';
import { ConfigSheet } from './config-sheet';

// Two rows like shop.moneyhash.io: a muted strip of live settings, then the store nav.
export function Navbar() {
  const hydrated = useHydrated();
  const { currency, setCurrency } = useCart();
  const cfg = useConfig();

  return (
    <header className="fixed top-0 z-30 w-full">
      <div className="bg-muted">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-4 overflow-x-auto px-4 py-2 text-xs sm:px-6 lg:px-8">
          {hydrated && (
            <>
              <Setting label="Environment">
                <Select
                  value={cfg.env}
                  onValueChange={v => cfg.set({ env: v as EnvId })}
                >
                  <SelectTrigger className="h-7 w-32 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ENV_IDS.map(id => (
                      <SelectItem key={id} value={id}>
                        {id === 'staging' ? 'Staging' : 'Production'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Setting>
              <Setting label="API">
                <Select
                  value={cfg.apiVersion}
                  onValueChange={v => cfg.set({ apiVersion: v as ApiVersion })}
                >
                  <SelectTrigger className="h-7 w-20 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {API_VERSIONS.map(v => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Setting>
              <Setting label="Intent secret">
                <Switch
                  checked={cfg.useIntentSecret}
                  onCheckedChange={v => cfg.set({ useIntentSecret: v })}
                  aria-label="Use intent secret"
                />
              </Setting>
              <Setting label="Card form">
                <Select
                  value={cfg.cardFormLayout}
                  onValueChange={v =>
                    cfg.set({ cardFormLayout: v as 'compact' | 'expanded' })
                  }
                >
                  <SelectTrigger className="h-7 w-28 bg-background text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="expanded">Expanded</SelectItem>
                  </SelectContent>
                </Select>
              </Setting>
              <Setting label="Console">
                <Switch
                  checked={cfg.showConsole}
                  onCheckedChange={v => cfg.set({ showConsole: v })}
                  aria-label="Show console"
                />
              </Setting>
            </>
          )}
          <ConfigSheet />
        </div>
      </div>
      <nav className="-mt-px border-b bg-background shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <MoneyHashLogo />
            <span className="hidden text-lg font-semibold sm:inline">
              Integration Playground
            </span>
          </Link>
          <div className="ms-auto flex items-center gap-2">
            <Select
              value={hydrated ? currency : 'AED'}
              onValueChange={v => setCurrency(v as Currency)}
            >
              <SelectTrigger className="w-24" aria-label="Currency">
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
            <CartPopover />
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </header>
  );
}

function Setting({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 border-e pe-4">
      <span className="text-subtler">{label}</span>
      {children}
    </label>
  );
}

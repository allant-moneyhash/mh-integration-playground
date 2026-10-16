'use client';
// The scenario choice, laid out like the MoneyHash Sandbox: labelled dropdowns
// ("API | External API", "Experience | Your checkout page"), each with a one-line
// explanation, then the checkout settings limited to what works on the chosen API.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BACKEND_APIS } from '@/flows/types';
import { useConfig } from '@/store/config';
import {
  ALLOWED,
  EXPERIENCES,
  SETTING_LABELS,
  normalise,
  switchApi,
  METHODS_LOOKUPS,
  lookupSends,
  type CheckoutSettings,
  type Selection,
} from '@/flows/selection';

const SETTING_HINTS = {
  intentTiming: 'Methods first: the intent is created when the customer picks a method. Intent first: up front. BIN lookup first: the card (cardForm.binLookup) or the Apple Pay / Google Pay receipt (binLookupByReceipt) is looked up before paying; for cards the store can then apply an offer and installments before the intent.',
  threeDs: 'In the page: the SDK shows the bank’s page here. Redirect: a full-page redirect.',
  hosted: 'In an iframe on your page, or send the customer to MoneyHash’s page.',
  methodsLookup: {
    auto: 'getMethods sends the Flow ID and customer from Inputs when they are set.',
    'flow-only': 'flowId only: the dashboard flow decides the methods and routing. No customer, so no saved cards.',
    'customer-only': 'customer only: the account’s default methods plus this customer’s saved cards and balances. Flow ID is ignored.',
    none: 'currency and amount only: the account’s default methods, no saved cards. Flow ID and customer are ignored.',
    'generic-then-customer': 'A guest call first (no customer), then the same call with customer once they sign in, adding their saved cards.',
  },
};

export function IntegrationPicker({ selection, onChange }: { selection: Selection; onChange: (s: Selection) => void }) {
  const sel = normalise(selection);
  const { api, experience, settings } = sel;
  const set = (patch: Partial<CheckoutSettings>) => onChange(normalise({ ...sel, settings: { ...settings, ...patch } }));
  const apiInfo = BACKEND_APIS.find(a => a.id === api)!;
  const expInfo = EXPERIENCES.find(e => e.id === experience)!;
  const hasFlow = useConfig(c => !!c.paymentFlowId.trim());
  const hasCustomer = useConfig(c => Object.keys(c.customerIds).length > 0);
  const sends = lookupSends(settings.methodsLookup);
  const strict = settings.methodsLookup !== 'auto';
  const lookupNeeds = [strict && sends.flow && !hasFlow ? 'a Flow ID' : '', strict && sends.customer && !hasCustomer ? 'a customer' : '']
    .filter(Boolean)
    .join(' and ');

  return (
    <div className="space-y-4">
      <PrefixedSelect
        prefix="API"
        value={api}
        options={BACKEND_APIS.map(a => ({ value: a.id, label: a.label }))}
        onChange={id => id !== api && onChange(switchApi(sel, id))}
        hint={`${apiInfo.summary} ${apiInfo.pci}.`}
      />
      <PrefixedSelect
        prefix="Experience"
        value={experience}
        options={EXPERIENCES.map(e => ({ value: e.id, label: e.label, aside: e.soon ? 'Coming soon' : undefined, disabled: e.soon }))}
        onChange={id => onChange({ ...sel, experience: id })}
        hint={expInfo.summary}
      />

      {experience === 'checkout' && (
        <div className="space-y-4">
          {api === 'payment' && (
            <PrefixedSelect
              prefix="Intent created"
              value={settings.intentTiming}
              options={(['methods-first', 'intent-first', 'card-first'] as const).map(v => ({ value: v, label: SETTING_LABELS.intentTiming[v] }))}
              onChange={v => set({ intentTiming: v })}
              hint={SETTING_HINTS.intentTiming}
            />
          )}
          {api === 'payment' && settings.intentTiming !== 'card-first' && (
            <PrefixedSelect
              prefix="getMethods for"
              value={settings.methodsLookup}
              options={METHODS_LOOKUPS.filter(v => v !== 'generic-then-customer' || settings.intentTiming === 'methods-first').map(v => ({ value: v, label: SETTING_LABELS.methodsLookup[v] }))}
              onChange={v => set({ methodsLookup: v })}
              hint={`${SETTING_HINTS.methodsLookup[settings.methodsLookup]}${settings.intentTiming === 'intent-first' ? ' Intent first: the intent is created with the same flow and customer, and getMethods({ intentId }) follows it.' : ''}${lookupNeeds ? ` Add ${lookupNeeds} under Inputs for this to show.` : ''}`}
            />
          )}
          <PrefixedSelect
            prefix="Card details"
            value={settings.cardEntry}
            options={ALLOWED[api].cardEntry.map(v => ({ value: v, label: SETTING_LABELS.cardEntry[v] }))}
            onChange={v => set({ cardEntry: v })}
            hint={
              api === 'direct'
                ? 'Your own form sends the card to your server, then the vault (PCI DSS).'
                : api === 'external'
                  ? 'The External API can’t take raw card data, so the card goes into MoneyHash’s iframes.'
                  : 'The JS SDK’s card fields (MoneyHash iframes).'
            }
          />
          <PrefixedSelect
            prefix="Wallet buttons"
            value={settings.wallets}
            options={ALLOWED[api].wallets.map(v => ({ value: v, label: SETTING_LABELS.wallets[v] }))}
            onChange={v => set({ wallets: v })}
            hint={
              api === 'payment'
                ? 'With the Payment API, wallets go through the SDK.'
                : 'Your own: Apple Pay / Google Pay buttons without the SDK; your server validates the Apple session and sends the receipt.'
            }
          />
          <PrefixedSelect
            prefix="3DS"
            value={settings.threeDs}
            options={(['page', 'redirect'] as const).map(v => ({ value: v, label: SETTING_LABELS.threeDs[v] }))}
            onChange={v => set({ threeDs: v })}
            hint={SETTING_HINTS.threeDs}
          />
        </div>
      )}
      {experience === 'hosted' && (
        <PrefixedSelect
          prefix="Hosted page"
          value={settings.hosted}
          options={(['iframe', 'redirect'] as const).map(v => ({ value: v, label: SETTING_LABELS.hosted[v] }))}
          onChange={v => set({ hosted: v })}
          hint={SETTING_HINTS.hosted}
        />
      )}
    </div>
  );
}

/** A select with its name inside the box on the left, as in the Sandbox ("Type | Payments"). */
function PrefixedSelect<T extends string>({
  prefix,
  value,
  options,
  onChange,
  hint,
}: {
  prefix: string;
  value: T;
  options: { value: T; label: string; aside?: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  hint?: string;
}) {
  const only = options.length === 1;
  return (
    <div>
      <div className="flex h-10 items-stretch overflow-hidden rounded-sm border border-input">
        <span className="flex w-32 shrink-0 items-center border-e border-input bg-accent/50 px-3 text-sm text-subtle">{prefix}</span>
        {only ? (
          <span className="flex flex-1 items-center px-3 text-sm font-semibold text-bolder">{options[0].label}</span>
        ) : (
          <Select value={value} onValueChange={v => onChange(v as T)}>
            <SelectTrigger className="h-full flex-1 rounded-none border-0 text-sm font-semibold text-bolder shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map(o => (
                <SelectItem key={o.value} value={o.value} disabled={o.disabled} className="data-[state=checked]:font-semibold">
                  {o.label}
                  {o.aside && <span className="ms-2 text-xs text-subtle">· {o.aside}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}

'use client';
// The MoneyHash customer for this checkout (per environment). With one set,
// SDK flows show the customer's saved cards and can save new ones.
import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createCustomer } from '@/lib/api-client';
import { useConfig } from '@/store/config';
import { errorText } from '@/flows/sdk/checkout/card-form';
import { accountKey, type Session } from '@/flows/session';

export function useCustomerId(session: Session) {
  const key = accountKey(session);
  return useConfig(s => s.customerIds[key] ?? '');
}

export function CustomerPicker({ session }: { session: Session }) {
  const customerId = useCustomerId(session);
  const customer = useConfig(s => s.customer);
  const [draft, setDraft] = useState(customerId);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const select = (id: string) => {
    useConfig.getState().set({
      customerIds: {
        ...useConfig.getState().customerIds,
        [accountKey(session)]: id.trim(),
      },
    });
    setDraft(id.trim());
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-subtle">
        MoneyHash customer (optional). With one, the SDK flows show this
        customer’s saved cards and can save new cards.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          label="Customer ID"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          containerClassName="min-w-60 flex-1"
        />
        {customerId && draft.trim() === customerId ? (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => select('')}
            title="Check out as a guest"
          >
            <X className="size-4" /> Guest
          </Button>
        ) : (
          <Button
            variant="outline"
            className="h-10"
            disabled={!draft.trim()}
            onClick={() => select(draft)}
          >
            Use
          </Button>
        )}
        <Button
          variant="outline"
          className="h-10"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            setError(null);
            try {
              select(
                await createCustomer(session, {
                  first_name: customer.first_name,
                  last_name: customer.last_name,
                  email: customer.email,
                  phone_number: customer.phone_number,
                  description: 'Integration Playground test customer',
                }),
              );
            } catch (e) {
              setError(errorText(e));
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating && <Loader2 className="size-4 animate-spin" />}
          Create test customer
        </Button>
      </div>
      {customerId && (
        <p className="text-xs text-green-700 dark:text-green-400">
          Using customer {customerId}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

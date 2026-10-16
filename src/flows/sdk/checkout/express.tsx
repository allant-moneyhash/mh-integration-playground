'use client';
// Express checkout, as on shop.moneyhash.io. Each wallet uses its provider's official button and the
// method's nativePayData from getMethods. The wallet returns a receipt; the
// checkout then creates the intent, calls proceedWith and submitPaymentReceipt.
import { useEffect, useRef, useState } from 'react';
import GooglePayButton from '@google-pay/button-react';
import type { Method, NativeReceiptData } from '@moneyhash/js-sdk/headless';
import { cn } from '@/lib/cn';
import type { Sdk } from '../runtime';

/** One height for every wallet button (Apple ≥30pt, Google ≥40px, Samsung: unscaled artwork). */
const BUTTON_HEIGHT = 44;

const APPLE_PAY_SDK ='https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js';
const SAMSUNG_PAY_SDK = 'https://img.mpay.samsung.com/gsmpi/sdk/samsungpay_web_sdk.js';

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Could not load ${src}`));
        document.head.appendChild(s);
      }),
    );
  }
  return scripts.get(src)!;
}

/**
 * Called with the wallet receipt. Resolves when the payment was submitted;
 * rejects on failure (so the wallet sheet can show an error).
 */
export type OnReceipt = (methodId: string, receipt: NativeReceiptData) => Promise<void>;

/** Apple Pay merchant validation: the SDK's validateApplePayMerchantSession, or your server (External/Direct API). */
export type ValidateApplePay = (methodId: string, validationUrl: string) => Promise<unknown>;

export function ExpressCheckout({
  methods,
  sdk,
  live,
  onReceipt,
  validateApplePay,
}: {
  methods: Method[];
  sdk?: Sdk;
  live: boolean;
  onReceipt: OnReceipt;
  validateApplePay?: ValidateApplePay;
}) {
  const validate: ValidateApplePay | undefined =
    validateApplePay ?? (sdk ? (methodId, validationUrl) => sdk.validateApplePayMerchantSession({ methodId, validationUrl }) : undefined);
  const shown = methods.filter(m => ['GOOGLE_PAY', 'APPLE_PAY', 'SAMSUNG_PAY'].includes(m.id) && m.nativePayData);
  if (!shown.length) return null;
  return (
    <div className="relative grid grid-cols-1 gap-3 rounded border p-4 pt-8">
      <p className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-sm text-bolder">Express checkout</p>
      {shown.map(m =>
        m.id === 'GOOGLE_PAY' ? (
          <GooglePay key={m.id} data={m.nativePayData!} live={live} onReceipt={r => onReceipt(m.id, r)} />
        ) : m.id === 'APPLE_PAY' ? (
          <ApplePay key={m.id} data={m.nativePayData!} validate={validate} onReceipt={r => onReceipt(m.id, r)} />
        ) : (
          <SamsungPay key={m.id} data={m.nativePayData!} onReceipt={r => onReceipt(m.id, r)} />
        ),
      )}
    </div>
  );
}

type NativeData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function Unavailable({ text }: { text: string }) {
  return <p className="rounded-sm border border-dashed px-3 py-2 text-center text-xs text-subtle">{text}</p>;
}

/** Google's official button (@google-pay/button-react), configured from nativePayData. */
function GooglePay({ data, live, onReceipt }: { data: NativeData; live: boolean; onReceipt: (r: NativeReceiptData) => Promise<void> }) {
  return (
    <GooglePayButton
      environment={data.environment === 'PRODUCTION' || live ? 'PRODUCTION' : 'TEST'}
      buttonColor="black"
      buttonType="pay"
      buttonSizeMode="fill"
      buttonRadius={4}
      // Google guideline: min height 40px; keep the official artwork, no custom text.
      style={{ width: '100%', height: BUTTON_HEIGHT }}
      paymentRequest={{
        apiVersion: 2,
        apiVersionMinor: 0,
        allowedPaymentMethods: [
          {
            type: 'CARD',
            parameters: {
              allowedAuthMethods: data.allowed_card_auth_methods ?? ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: data.allowed_card_networks ?? ['MASTERCARD', 'VISA'],
              billingAddressRequired: true,
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: { gateway: data.gateway, gatewayMerchantId: data.gateway_merchant_id },
            },
          },
        ],
        merchantInfo: { merchantId: data.merchant_id, merchantName: data.merchant_name },
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPriceLabel: 'Total',
          totalPrice: `${data.amount}`,
          currencyCode: data.currency_code,
          countryCode: data.country_code || 'US',
        },
        emailRequired: true,
      }}
      onLoadPaymentData={async res => {
        await onReceipt({
          receipt: res.paymentMethodData.tokenizationData.token,
          receiptBillingData: { email: res.email ?? '' },
        });
      }}
    />
  );
}

/** Apple's official <apple-pay-button>; ApplePaySession with merchant validation through MoneyHash. */
function ApplePay({ data, validate, onReceipt }: { data: NativeData; validate?: ValidateApplePay; onReceipt: (r: NativeReceiptData) => Promise<void> }) {
  const [ready, setReady] = useState<boolean | null>(null);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadScript(APPLE_PAY_SDK)
      .then(() => setReady(typeof window.ApplePaySession !== 'undefined' && window.ApplePaySession.canMakePayments()))
      .catch(() => setReady(false));
  }, []);

  useEffect(() => {
    const el = holder.current?.querySelector('apple-pay-button');
    if (!el) return;
    const start = () => {
      const session = new window.ApplePaySession(3, {
        countryCode: data.country_code,
        currencyCode: data.currency_code,
        supportedNetworks: data.supported_networks,
        merchantCapabilities: data.supported_capabilities ?? ['supports3DS'],
        total: { label: data.merchant_name ?? 'Total', type: 'final', amount: `${data.amount}` },
        requiredShippingContactFields: ['email'],
      });
      session.onvalidatemerchant = e => {
        if (!validate) return session.abort();
        validate(data.method_id, e.validationURL)
          .then(s => session.completeMerchantValidation(s))
          .catch(() => session.abort());
      };
      session.onpaymentauthorized = async e => {
        try {
          await onReceipt({
            receipt: JSON.stringify({ token: e.payment.token }),
            receiptBillingData: { email: e.payment.shippingContact?.emailAddress ?? '' },
          });
          session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
        } catch {
          session.completePayment(window.ApplePaySession.STATUS_FAILURE);
        }
      };
      session.begin();
    };
    el.addEventListener('click', start);
    return () => el.removeEventListener('click', start);
  }, [ready, data, validate, onReceipt]);

  if (ready === null) return <div className="h-11 animate-pulse rounded-sm bg-muted" />;
  if (!ready) return <Unavailable text="Apple Pay shows in Safari on an Apple device with a card in Wallet, on a domain registered for Apple Pay." />;
  return (
    <div ref={holder}>
      {/* Apple's official web component (apple-pay-sdk.js), sized through its CSS variables. */}
      <apple-pay-button
        buttonstyle="black"
        type="buy"
        locale="en-US"
        style={
          {
            '--apple-pay-button-width': '100%',
            '--apple-pay-button-height': `${BUTTON_HEIGHT}px`,
            '--apple-pay-button-border-radius': '4px',
            '--apple-pay-button-padding': '0px',
            display: 'block',
          } as React.CSSProperties
        }
      />
    </div>
  );
}

type SamsungClient = {
  isReadyToPay: (m: Record<string, unknown>) => Promise<{ result: boolean }>;
  createButton: (o: { onClick: () => void; buttonStyle: string; type: string }) => HTMLElement;
  loadPaymentSheet: (m: Record<string, unknown>, t: Record<string, unknown>) => Promise<unknown>;
  notify: (o: Record<string, unknown>) => void;
};

/** Samsung's web SDK button, as in the shop's samsung-pay.tsx. */
function SamsungPay({ data, onReceipt }: { data: NativeData; onReceipt: (r: NativeReceiptData) => Promise<void> }) {
  const holder = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const container = holder.current;
    if (!container) return;
    let cancelled = false;
    const paymentMethods = {
      version: '2',
      serviceId: data.service_id,
      protocol: 'PROTOCOL_3DS',
      allowedBrands: data.allowed_brands ?? data.allowed_card_networks,
      isCardholderNameRequired: true,
    };
    const transactionDetail = {
      orderNumber: data.trx_uuid,
      merchant: { name: data.merchant_name, url: window.location.hostname, id: data.merchant_id, countryCode: data.country_code },
      amount: { option: 'FORMAT_TOTAL_ESTIMATED_AMOUNT', currency: data.currency_code, total: data.amount },
    };
    loadScript(SAMSUNG_PAY_SDK)
      .then(async () => {
        const SP = (window as unknown as { SamsungPay?: { PaymentClient: new (o: { environment: string }) => SamsungClient } }).SamsungPay;
        if (!SP) throw new Error('no sdk');
        const client = new SP.PaymentClient({ environment: data.environment ?? 'STAGE' });
        const ready = await client.isReadyToPay(paymentMethods);
        if (cancelled) return;
        if (!ready?.result) return setState('unavailable');
        const button = client.createButton({
          buttonStyle: 'black',
          type: 'buy',
          onClick: async () => {
            try {
              const credential = await client.loadPaymentSheet(paymentMethods, transactionDetail);
              await onReceipt({ receipt: JSON.stringify(credential) } as NativeReceiptData);
              client.notify({ status: 'CHARGED' });
            } catch {
              client.notify({ status: 'ERRED', provider: 'MoneyHash' });
            }
          },
        });
        container.replaceChildren(button);
        setState('ready');
      })
      .catch(() => !cancelled && setState('unavailable'));
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [data, onReceipt]);

  return (
    <div>
      {/* Samsung's own button artwork: fixed height, natural width, centred, never stretched. */}
      <div
        ref={holder}
        style={{ height: BUTTON_HEIGHT }}
        className={cn(
          'flex items-center justify-center overflow-hidden rounded-sm bg-black',
          '[&>*]:!h-full [&>*]:!w-auto [&>*]:!max-w-full [&_img]:!h-full [&_img]:!w-auto [&_img]:object-contain',
          state !== 'ready' && 'hidden',
        )}
      />
      {state === 'loading' && <div className="h-11 animate-pulse rounded-sm bg-muted" />}
      {state === 'unavailable' && <Unavailable text="Samsung Pay shows on Samsung devices/browsers where Samsung Pay is set up." />}
    </div>
  );
}

declare global {
  interface Window {
    ApplePaySession: typeof ApplePaySession;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace React.JSX {
    interface IntrinsicElements {
      'apple-pay-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        buttonstyle?: string;
        type?: string;
        locale?: string;
      };
    }
  }
}

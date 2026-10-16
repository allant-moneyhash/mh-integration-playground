# MoneyHash Integration Playground

Try every MoneyHash integration in a working demo store, and see exactly what your
server, the browser and MoneyHash send to each other.

**[Open the playground →](https://mh-integration-playground.vercel.app)**

Pick an integration, pay with a test card, and a live console shows each call as it
happens: the request, MoneyHash's response, what it means and what comes next, with a
link to the docs for that step. Every page in the store is also a reference
implementation you can copy from this repository.

## What you can try

| Integration                      | What it shows                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Payment API + JS SDK**         | Your own checkout page: methods, saved cards, Apple Pay / Google Pay, 3DS, retries on failure. |
| **Payment API + hosted page**    | MoneyHash's payment page, in an iframe or by redirect.                                         |
| **Payment API + MoneyHash form** | `renderForm`: MoneyHash's form inside your page.                                               |
| **External API**                 | Your server drives the intent (select method, pay saved cards); card details via the SDK.      |
| **Direct API**                   | Your server also sends the card to the MoneyHash vault, from your own card form (PCI DSS).     |
| **BIN lookup first**             | Look up a card or a wallet receipt before paying, then apply an offer or installment plans.    |

Settings let you reproduce real setups: intent created up front or after the customer
picks a method, `getMethods` with or without a flow and customer, 3DS in the page or by
redirect, and your own JSON edits to any request.

## Use it with your account

1. Get a test-mode **Account API key** (secret) and **Public API key** from your MoneyHash dashboard.
2. In the playground, open **Config** (top right), pick the environment that matches the keys and paste them.
3. Fill in the checkout details and press **Continue to payment**.

Your keys stay in your browser and only travel to the playground's server to make the
call you asked for. They are never logged, never shown unmasked and never included in
share links. Save a setup as a **preset** to come back to it, or copy a link to share
the scenario (without keys) with your team or MoneyHash support.

## Where to look in the code

| You want to see…                         | Look at                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Creating a payment intent on your server | `src/app/api/mh/payment-intents/route.ts`, `src/lib/intent-body.ts`                          |
| A headless JS SDK checkout               | `src/flows/sdk/checkout/sdk-checkout.tsx`, `card-form.tsx`, `express.tsx`, `saved-cards.tsx` |
| BIN lookup before the intent             | `src/flows/sdk/checkout/card-first.tsx`                                                      |
| External and Direct API calls            | `src/lib/server/intent-actions.ts`, `src/flows/server-driven/`                               |
| Hosted page (iframe / redirect)          | `src/flows/embed-iframe/`, `src/flows/embed-redirect/`                                       |
| Receiving and verifying webhooks         | `src/app/api/webhooks/route.ts`, `src/lib/server/webhooks.ts`                                |
| Showing the order result from webhooks   | `src/components/checkout/order-view.tsx`, `src/lib/intent-outcome.ts`                        |

## Run your own copy

You need Node.js 20 or later.

```shell
git clone https://github.com/allant-moneyhash/mh-integration-playground.git
cd mh-integration-playground
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 and paste your keys in **Config**, or put them in
`.env.local` (see `.env.example` for every variable). MoneyHash can't send webhooks to
`localhost`, so to see them, deploy the app (for example to Vercel) or use a tunnel,
and the store uses that URL as the intent's `webhook_url`.

Deploying it publicly? Use test-mode keys only, set `MH_BLOCK_LIVE_KEYS=true`, and set
the webhook signing keys so unsigned webhooks are refused. For Apple Pay, replace
`public/.well-known/apple-developer-merchantid-domain-association` with the file
for your own domain.

## Contributing

Issues and pull requests are welcome. The code follows the same style as
[shop.moneyhash.io](https://github.com/MoneyHash/shop.moneyhash.io): Prettier
(`npm run prettier:fix`), EditorConfig and conventional commit messages
(`feat: …`, `fix: …`). A pre-push hook scans for secrets, so keys never reach the
repository.

## Learn more

- [MoneyHash documentation](https://docs.moneyhash.io)
- [JS SDK on npm](https://www.npmjs.com/package/@moneyhash/js-sdk)
- [shop.moneyhash.io](https://shop.moneyhash.io), MoneyHash's demo store

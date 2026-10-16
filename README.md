# MoneyHash Integration Playground

A demo store (styled after shop.moneyhash.io) where you pick an integration type and watch every call
between the store, MoneyHash and the webhook inbox in a live console.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in test-mode keys
npm run dev
```

Without keys in `.env.local`, paste test keys into **Config** in the UI (kept for the tab, or saved with a preset in your browser only).
Webhooks can't reach `localhost`; deploy to Vercel (or use a tunnel) to see them in the console.

## How it is put together

| Path | What it does |
| --- | --- |
| `src/app/api/mh/*` | Server routes. The only code that holds secret keys and calls MoneyHash (fixed hosts). |
| `src/lib/server/mh.ts` | MoneyHash client, key resolution, live-key guard, masked console entries. |
| `src/app/api/webhooks` | Webhook receiver (`MoneyHash-Signature` v3 check) and the inbox the console polls. |
| `src/flows/*` | One folder per integration flow, all implementing `IntegrationFlow`. |
| `src/flows/session.ts` | The only place that reads the "Use intent secret" switch. |
| `src/lib/embed-options.ts` | Embed customisation options as data. |
| `src/lib/mask.ts` | Masking used by the server, the console and exports. |

## Add a flow

1. Create `src/flows/<id>/index.tsx` exporting an `IntegrationFlow` (`steps`, optional `intentFields`, `Checkout`).
2. Map the selection that picks it in `resolveFlow` (`src/flows/registry.ts`) and add any new setting to `src/flows/selection.ts`.
3. If it calls new MoneyHash endpoints, add a server route under `src/app/api/mh/` that uses `mhCall`.

## Apple Pay domain file

`public/.well-known/apple-developer-merchantid-domain-association` verifies Apple Pay for the hosted demo's domain only. If you deploy your own copy, replace it with the file for your domain.

## Security rules

- Secret keys live only in server env vars or the user's own browser (tab storage, or a preset they saved); they reach MoneyHash only via our server and are never in share links, logs or exports.
- Use test-mode keys for any demo keys you set on a public deployment: anyone who can open the site can use them. Set `MH_BLOCK_LIVE_KEYS=true` there.
- With `MH_*_WEBHOOK_SIGNING_KEY` set, webhooks without a valid `MoneyHash-Signature` are refused.
- Live-mode keys are allowed by default; the console shows a LIVE MODE entry whenever MoneyHash reports `is_live: true`. Set `MH_BLOCK_LIVE_KEYS=true` to refuse them: the intent is closed and the key blocked.
- Everything shown in the console, exported, or saved as a preset is masked or stripped of secrets.
- `npm run secret-scan` runs before every push (`.githooks/pre-push`); CI also runs gitleaks.

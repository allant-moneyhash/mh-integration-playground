// Direct API: like the External API, plus the raw card goes from this server to
// the MoneyHash vault (PCI DSS merchants). MoneyHash validates the card; see lib/server/intent-actions.
import { handleIntentAction } from '@/lib/server/intent-actions';

export function POST(req: Request) {
  return handleIntentAction(req, 'direct');
}

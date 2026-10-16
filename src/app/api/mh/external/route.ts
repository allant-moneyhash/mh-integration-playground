// External API: the backend drives the intent (no PCI scope). Logic shared with
// the Direct API in lib/server/intent-actions.
import { handleIntentAction } from '@/lib/server/intent-actions';

export function POST(req: Request) {
  return handleIntentAction(req, 'external');
}

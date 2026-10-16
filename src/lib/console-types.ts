export type ConsoleSource =
  'Backend API' | 'Frontend SDK' | 'Frontend' | 'Webhook' | 'Playground';

export type ConsoleEntry = {
  id: string;
  ts: number;
  source: ConsoleSource;
  /** Plain-language name of the step, e.g. "Create payment intent". */
  title: string;
  method?: string;
  endpoint?: string;
  request?: { headers?: Record<string, unknown>; body?: unknown };
  status?: number;
  latencyMs?: number;
  response?: unknown;
  ok: boolean;
  note?: string;
  /** The payment attempt this entry belongs to (console groups by attempt). */
  attemptId?: string;
};

export type ConsoleAttempt = {
  id: string;
  label: string;
  startedAt: number;
  intentIds: string[];
  /** Which run of the payment page started it (so a page knows its attempt is ready). */
  runKey?: string;
};

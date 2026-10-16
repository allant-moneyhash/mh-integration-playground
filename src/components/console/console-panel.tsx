'use client';
// The live console, laid out like the MoneyHash dashboard's "All Activities":
// a timeline of compact rows (status, title, who talked to whom, time since the
// previous activity). Click a row to open it: a plain explanation, what to do on
// errors, and Request / Response tabs. Logs can be cleared or deleted.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronRight, Copy, Download, History, Info, PanelRightClose, PanelRightOpen, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePathname } from 'next/navigation';
import { contextBefore, explain, nextState, type ExplainContext } from '@/lib/console-explain';
import { useConfig } from '@/store/config';
import { Button } from '@/components/ui/button';
import { useConsole } from '@/store/console';
import { useHydrated } from '@/lib/use-hydrated';
import type { ConsoleAttempt, ConsoleEntry, ConsoleSource } from '@/lib/console-types';
import { maskDeep } from '@/lib/mask';
import { cn } from '@/lib/cn';
import { JsonView } from './json-view';
import { EDITABLE_SDK_CALLS } from '@/flows/sdk/runtime';
import type { IntentPatch } from '@/lib/intent-body';

/** Who talks to whom, shown on every row. */
const SOURCE_HINT: Record<ConsoleSource, string> = {
  'Backend API': 'Your server → MoneyHash',
  'Frontend SDK': 'Browser (JS SDK) → MoneyHash',
  Frontend: 'Browser',
  Webhook: 'MoneyHash → your server',
  Playground: 'Playground',
};

/** What the panel shows: the checkout in progress, the History list, or one past checkout. */
type View = { kind: 'current' } | { kind: 'history' } | { kind: 'past'; attemptId: string };

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
const dayOf = (ts: number) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const gap = (ms: number) => (ms < 1000 ? `${Math.max(0, ms)}ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 60_000)} min`);

export function ConsolePanel({ className }: { className?: string }) {
  const hydrated = useHydrated();
  const entries = useConsole(s => s.entries);
  const attempts = useConsole(s => s.attempts);
  const currentId = useConsole(s => s.currentAttemptId);
  const [view, setView] = useState<View>({ kind: 'current' });

  // A new checkout always brings the panel back to it.
  const [seenCurrent, setSeenCurrent] = useState(currentId);
  if (currentId !== seenCurrent) {
    setSeenCurrent(currentId);
    setView({ kind: 'current' });
  }

  const attemptOf = (id: string | null) => attempts.find(a => a.id === id) ?? null;
  const entriesOf = (id: string) => entries.filter(e => e.attemptId === id);
  const shown = view.kind === 'past' ? attemptOf(view.attemptId) : view.kind === 'current' ? attemptOf(currentId) : null;
  const past = [...attempts].reverse().filter(a => a.id !== currentId);

  function exportLog(attempt: ConsoleAttempt) {
    // Entries are already masked; mask again in case anything slipped through.
    const list = entriesOf(attempt.id);
    const data = { checkout: attempt, calls: list.map((e, i) => ({ ...e, explanation: explain(e, contextBefore(list, i)) })) };
    const blob = new Blob([JSON.stringify(maskDeep(data), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `moneyhash-checkout-${new Date(attempt.startedAt).toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (!hydrated) return <aside className={cn('border bg-background lg:rounded-md', className)} />;

  return (
    <aside className={cn('flex min-h-0 flex-col border bg-background lg:rounded-md', className)}>
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-bolder">{view.kind === 'history' ? 'History' : view.kind === 'past' ? 'Past checkout' : 'All activities'}</h2>
          <p className="truncate text-xs text-subtle">
            {view.kind === 'history' ? 'Earlier checkouts in this browser.' : 'Every call between your store and MoneyHash in this checkout.'}
          </p>
        </div>
        {view.kind === 'current' ? (
          <Button variant="outline" size="sm" onClick={() => setView({ kind: 'history' })} disabled={!past.length} title="Earlier checkouts">
            <History className="size-4" /> History{past.length ? ` (${past.length})` : ''}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setView(view.kind === 'past' ? { kind: 'history' } : { kind: 'current' })}>
            <ArrowLeft className="size-4" /> {view.kind === 'past' ? 'History' : 'Current'}
          </Button>
        )}
        <Button variant="outline" size="icon" aria-label="Hide console" title="Hide" onClick={() => useConfig.getState().set({ showConsole: false })}>
          <PanelRightClose className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {view.kind === 'history' ? (
          <HistoryList attempts={past} entriesOf={entriesOf} onOpen={id => setView({ kind: 'past', attemptId: id })} />
        ) : shown ? (
          <CheckoutLog attempt={shown} entries={entriesOf(shown.id)} onExport={() => exportLog(shown)} />
        ) : (
          <div className="p-8 text-center text-sm text-subtle">
            <p className="text-bolder">Ready for a new checkout</p>
            <p className="mt-1">Continue to payment and every call appears here, with a plain explanation.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function HistoryList({ attempts, entriesOf, onOpen }: { attempts: ConsoleAttempt[]; entriesOf: (id: string) => ConsoleEntry[]; onOpen: (id: string) => void }) {
  const removeAttempt = useConsole(s => s.removeAttempt);
  const clear = useConsole(s => s.clear);
  if (!attempts.length) return <p className="p-8 text-center text-sm text-subtle">No earlier checkouts.</p>;
  return (
    <div>
      <ul className="divide-y">
        {attempts.map(a => {
          const list = entriesOf(a.id);
          const result = attemptResult(list);
          return (
            <li key={a.id} className="flex items-center gap-2 px-4 py-3 hover:bg-accent">
              <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(a.id)}>
                <span className="block truncate text-sm text-bolder">{a.label}</span>
                <span className="block text-xs text-subtle">
                  {dayOf(a.startedAt)} {clock(a.startedAt)} · {list.length} {list.length === 1 ? 'activity' : 'activities'}
                  {a.intentIds[0] && ` · ${a.intentIds[0]}`}
                </span>
              </button>
              {result && <StatusText {...result} />}
              <button
                className="rounded p-1.5 text-subtler hover:bg-background hover:text-destructive"
                aria-label="Delete this checkout"
                title="Delete"
                onClick={() => removeAttempt(a.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t p-3 text-center">
        <Button variant="ghost" size="sm" onClick={clear}>
          <Trash2 className="size-3.5" /> Clear history
        </Button>
      </div>
    </div>
  );
}

/** One checkout's activities, newest last, as a timeline. */
function CheckoutLog({ attempt, entries, onExport }: { attempt: ConsoleAttempt; entries: ConsoleEntry[]; onExport: () => void }) {
  const last = useRef<HTMLDivElement>(null);
  const clearEntries = useConsole(s => s.clearEntries);
  const [open, setOpen] = useState<string | null>(null);
  const result = attemptResult(entries);
  useEffect(() => {
    last.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [entries.length]);

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-bolder">{attempt.label}</span>
          <span className="block text-xs text-subtle">
            {dayOf(attempt.startedAt)} {clock(attempt.startedAt)}
            {attempt.intentIds.map(id => (
              <button
                key={id}
                className="ms-2 inline-flex items-center gap-1 font-mono text-bolder hover:underline"
                title="Copy intent ID"
                onClick={() => {
                  navigator.clipboard.writeText(id);
                  toast.success('Intent ID copied');
                }}
              >
                {id} <Copy className="size-3" />
              </button>
            ))}
          </span>
        </span>
        {result && <StatusText {...result} />}
        <Button variant="ghost" size="icon" aria-label="Export this checkout" title="Export" onClick={onExport} disabled={!entries.length}>
          <Download className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Clear this log" title="Clear log" onClick={() => clearEntries(attempt.id)} disabled={!entries.length}>
          <Trash2 className="size-4" />
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-subtle">Waiting for the first activity…</p>
      ) : (
        <ol className="relative px-4 py-3">
          {/* The timeline line, as in the dashboard. */}
          <span className="absolute bottom-6 start-[22px] top-6 w-px bg-border" aria-hidden />
          {entries.map((e, i) => (
            <EntryRow
              key={e.id}
              entry={e}
              context={contextBefore(entries, i)}
              after={i > 0 ? e.ts - entries[i - 1].ts : null}
              open={open === e.id}
              onToggle={() => setOpen(o => (o === e.id ? null : e.id))}
            />
          ))}
        </ol>
      )}
      <div ref={last} />
    </div>
  );
}

function StatusText({ label, tone }: { label: string; tone: 'ok' | 'bad' | 'pending' | 'neutral' }) {
  return (
    <span
      className={cn(
        'shrink-0 text-xs font-medium',
        tone === 'ok' && 'text-green-700 dark:text-green-400',
        tone === 'bad' && 'text-destructive',
        tone === 'pending' && 'text-amber-700 dark:text-amber-400',
        tone === 'neutral' && 'text-subtle',
      )}
    >
      {label}
    </span>
  );
}

function attemptResult(entries: ConsoleEntry[]): { label: string; tone: 'ok' | 'bad' | 'pending' | 'neutral' } | null {
  if (entries.some(e => e.source === 'Webhook' && /successful$|^intent\.processed$/.test(e.title))) return { label: 'Paid', tone: 'ok' };
  if (entries.some(e => e.source === 'Webhook' && /failed$/.test(e.title))) return { label: 'Failed', tone: 'bad' };
  if (entries.some(e => e.source === 'Webhook' && /pending_(online_)?external_action$/.test(e.title))) return { label: 'Payment pending', tone: 'pending' };
  if (entries.some(e => !e.ok)) return { label: 'Error', tone: 'bad' };
  return entries.length ? { label: 'In progress', tone: 'neutral' } : null;
}

/** The status box at the start of a row: HTTP code, or OK / Error for SDK calls, or the webhook label. */
function StatusBox({ entry }: { entry: ConsoleEntry }) {
  const text = entry.source === 'Webhook' ? 'Webhook' : entry.status !== undefined ? String(entry.status || 'ERR') : entry.ok ? 'OK' : 'Error';
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
        entry.ok ? 'border-green-600/40 text-green-700 dark:text-green-400' : 'border-destructive/50 text-destructive',
      )}
    >
      {text}
    </span>
  );
}

type Tab = 'request' | 'headers' | 'response';

function EntryRow({
  entry,
  context,
  after,
  open,
  onToggle,
}: {
  entry: ConsoleEntry;
  context: ExplainContext;
  after: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const ex = explain(entry, context);
  const next = nextState(entry);
  const title = entry.source === 'Frontend SDK' ? `moneyHash.${entry.title}()` : entry.title;
  const hasRequest = entry.request?.body !== undefined && entry.request.body !== null;
  const hasHeaders = !!entry.request?.headers;
  const [tab, setTab] = useState<Tab>(entry.source === 'Webhook' || !hasRequest ? 'response' : 'request');

  return (
    <li className="relative ps-7 pb-3 last:pb-0">
      <span className={cn('absolute start-[3px] top-4 size-2 rounded-full', entry.ok ? 'bg-subtler' : 'bg-destructive')} aria-hidden />
      <div className={cn('rounded-md border bg-background', open ? 'border-primary' : 'hover:border-input', !entry.ok && !open && 'border-destructive/40')}>
        <button className="flex w-full items-start gap-2 p-3 text-left" onClick={onToggle} aria-expanded={open}>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBox entry={entry} />
              <span className="text-sm font-medium text-bolder [overflow-wrap:anywhere]">{title}</span>
            </div>
            <p className="text-xs text-subtle">{SOURCE_HINT[entry.source]}</p>
            <p className="text-xs text-subtler">
              {clock(entry.ts)}
              {after !== null && ` (${gap(after)} after previous activity)`}
              {entry.latencyMs !== undefined && ` · took ${gap(entry.latencyMs)}`}
            </p>
          </div>
          <ChevronRight className={cn('mt-1 size-4 shrink-0 text-subtle transition-transform', open && 'rotate-90')} />
        </button>

        {open && (
          <div className="space-y-3 border-t px-3 py-3">
            <p className="flex gap-2 text-sm text-foreground [overflow-wrap:anywhere]">
              <Info className="mt-0.5 size-4 shrink-0 text-subtle" />
              <span>{ex.summary}</span>
            </p>
            {next && (
              <p className="text-xs text-subtle">
                Next: <span className="font-mono text-bolder">{next.state}</span>
                {next.meaning && ` — ${next.meaning}`}
              </p>
            )}
            {entry.note && entry.source !== 'Webhook' && <p className="text-xs text-subtle [overflow-wrap:anywhere]">{entry.note}</p>}
            {!entry.ok && ex.fix && (
              <p className="rounded border border-destructive/40 px-3 py-2 text-xs [overflow-wrap:anywhere]">
                <span className="font-medium text-destructive">What to do: </span>
                {ex.fix}
              </p>
            )}

            {(entry.method || entry.endpoint) && (
              <p className="break-all font-mono text-[11px] text-subtle">
                {entry.method && <span className="me-1 rounded bg-accent px-1 py-0.5 font-semibold text-bolder">{entry.method}</span>}
                {entry.endpoint}
              </p>
            )}

            <div className="grid grid-cols-3 gap-1 rounded-md border p-1 text-xs">
              {(
                [
                  ['request', entry.source === 'Webhook' ? 'Payload' : 'Request body', hasRequest || entry.source === 'Webhook'],
                  ['headers', 'Request headers', hasHeaders],
                  ['response', entry.source === 'Webhook' ? 'Webhook body' : 'Response body', entry.response !== undefined],
                ] as [Tab, string, boolean][]
              )
                .filter(([id]) => !(entry.source === 'Webhook' && id === 'request'))
                .map(([id, label, enabled]) => (
                  <button
                    key={id}
                    disabled={!enabled}
                    onClick={() => setTab(id)}
                    className={cn(
                      'rounded px-2 py-1.5',
                      tab === id ? 'bg-primary text-primary-foreground' : 'text-subtle hover:bg-accent',
                      !enabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
                    )}
                  >
                    {label}
                  </button>
                ))}
            </div>
            {tab === 'request' && hasRequest && <Block value={entry.request!.body} />}
            {tab === 'request' && hasRequest && isCreateIntent(entry) && <ResendEditor body={entry.request!.body} target={{ kind: 'intent' }} />}
            {tab === 'request' && hasRequest && entry.source === 'Frontend SDK' && EDITABLE_SDK_CALLS.has(entry.title) && (
              <ResendEditor body={entry.request!.body} target={{ kind: 'sdk', method: entry.title }} />
            )}
            {tab === 'headers' && hasHeaders && <Block value={entry.request!.headers} />}
            {tab === 'response' && entry.response !== undefined && <Block value={entry.response} />}

            {ex.docs && (
              <a href={ex.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <BookOpen className="size-3.5" /> Docs
              </a>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** The request that creates the intent: the one worth editing and sending again. */
const isCreateIntent = (e: ConsoleEntry) => e.source === 'Backend API' && (e.title === 'Create payment intent' || /: create intent$/.test(e.title));

/** Tells the payment page to start a fresh attempt (pay-view listens). */
export const RESTART_EVENT = 'mh:restart-attempt';

/**
 * Edit the create-intent body and send it again: the changes become the intent edits
 * (the same ones as "Intent request" on the details page) and a new attempt starts,
 * so every later step follows from the edited intent. Only changed fields are kept,
 * so masked values in the log are never sent back.
 */
function ResendEditor({ body, target }: { body: unknown; target: { kind: 'intent' } | { kind: 'sdk'; method: string } }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(body, null, 2));
  const [error, setError] = useState<string | null>(null);
  // Only the payment page can start a new attempt.
  const onPayPage = usePathname() === '/checkout/pay';
  if (!onPayPage || typeof body !== 'object' || !body || Array.isArray(body)) return null;
  const original = body as Record<string, unknown>;

  function resend() {
    let edited: Record<string, unknown>;
    try {
      edited = JSON.parse(text);
      if (!edited || typeof edited !== 'object' || Array.isArray(edited)) throw new Error('not an object');
    } catch {
      setError('This is not a valid JSON object.');
      return;
    }
    const cfg = useConfig.getState();
    const current: IntentPatch = target.kind === 'intent' ? cfg.intentPatch : (cfg.sdkEdits?.[target.method] ?? { set: {}, removed: [] });
    const set = { ...current.set };
    const removed = new Set(current.removed);
    let changes = 0;
    for (const [k, v] of Object.entries(edited)) {
      if (JSON.stringify(original[k]) === JSON.stringify(v)) continue;
      set[k] = v;
      removed.delete(k);
      changes++;
    }
    for (const k of Object.keys(original)) {
      if (k in edited) continue;
      delete set[k];
      removed.add(k);
      changes++;
    }
    if (!changes) {
      setError('Nothing changed.');
      return;
    }
    const patch = { set, removed: [...removed] };
    if (target.kind === 'intent') cfg.set({ intentPatch: patch });
    else cfg.set({ sdkEdits: { ...cfg.sdkEdits, [target.method]: patch } });
    window.dispatchEvent(new Event(RESTART_EVENT));
    toast.success('Sent again with your edits, as a new attempt');
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Edit and resend
        </Button>
        {target.kind === 'sdk' && <ActiveSdkEdits method={target.method} />}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <textarea
        className="h-64 w-full rounded-md border border-input bg-background p-3 font-mono text-xs"
        spellCheck={false}
        value={text}
        onChange={e => {
          setText(e.target.value);
          setError(null);
        }}
      />
      <p className="text-xs text-subtle">
        {target.kind === 'intent'
          ? 'Changed fields are kept as intent edits (also shown under Intent request on the details page) and the checkout starts again from this call.'
          : `Changed fields are added to every ${target.method}() call from now on (e.g. customFields for a flow), and the checkout starts again.`}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={resend}>
          Resend
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** The edits in force for an SDK method, with a way to drop them. */
function ActiveSdkEdits({ method }: { method: string }) {
  const p = useConfig(c => c.sdkEdits?.[method]);
  const fields = p ? [...Object.keys(p.set), ...p.removed] : [];
  if (!fields.length) return null;
  return (
    <span className="text-xs text-subtle">
      Your edits: {fields.join(', ')} ·{' '}
      <button
        className="text-primary hover:underline"
        onClick={() => {
          const { sdkEdits, set } = useConfig.getState();
          const rest = { ...sdkEdits };
          delete rest[method];
          set({ sdkEdits: rest });
          window.dispatchEvent(new Event(RESTART_EVENT));
          toast.success(`Removed your ${method}() edits, new attempt started`);
        }}
      >
        Remove
      </button>
    </span>
  );
}

function Block({ value }: { value: unknown }) {
  return (
    <div className="relative">
      <button
        className="absolute end-2 top-2 rounded p-1 text-subtle hover:bg-background hover:text-bolder"
        title="Copy"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard.writeText(JSON.stringify(value, null, 2));
          toast.success('Copied');
        }}
      >
        <Copy className="size-3.5" />
      </button>
      <div className="max-h-96 overflow-auto rounded-md border bg-accent/40 p-3 pe-8 text-xs [overflow-wrap:anywhere]">
        <JsonView value={value} />
      </div>
    </div>
  );
}

/** Page layout with the console on the right, or full width when it is hidden. */
export function WithConsole({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  const hydrated = useHydrated();
  const show = useConfig(s => s.showConsole);
  if (hydrated && !show) {
    return (
      <>
        <div className={cn('mx-auto px-4 pt-8 pb-24 sm:px-6 lg:px-8', narrow ? 'max-w-3xl' : 'max-w-5xl')}>{children}</div>
        <ConsoleOpenTab />
      </>
    );
  }
  return (
    <div className="mx-auto grid max-w-[1600px] gap-6 px-4 pt-8 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_32rem] lg:px-8">
      <div className={cn('min-w-0', narrow && 'mx-auto w-full max-w-3xl')}>{children}</div>
      <ConsolePanel className="h-[70vh] lg:sticky lg:top-[120px] lg:h-[calc(100vh-136px)]" />
    </div>
  );
}

/** Tab on the right edge that brings the console back when it is hidden. */
export function ConsoleOpenTab() {
  // Calls in the current checkout only.
  const count = useConsole(s => (s.currentAttemptId ? s.entries.filter(e => e.attemptId === s.currentAttemptId).length : 0));
  return (
    <button
      onClick={() => useConfig.getState().set({ showConsole: true })}
      className="fixed right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-2 rounded-l-md border border-r-0 bg-background px-2 py-3 text-xs font-medium shadow-md [writing-mode:vertical-rl] hover:bg-accent"
    >
      <PanelRightOpen className="size-4 rotate-90" />
      Console{count ? ` (${count})` : ''}
    </button>
  );
}

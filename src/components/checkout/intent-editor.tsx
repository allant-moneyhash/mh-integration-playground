'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from 'next-themes';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  diffToPatch,
  patchIsEmpty,
  type IntentBody,
  type IntentPatch,
} from '@/lib/intent-body';

const Editor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] animate-pulse rounded-md bg-muted" />
  ),
});

function normalise(json: string) {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

type Props = {
  generated: IntentBody;
  final: IntentBody;
  patch: IntentPatch;
  onPatch: (p: IntentPatch) => void;
  onValidity: (valid: boolean) => void;
};

/**
 * Shows the exact intent request that will be sent. Edits are kept as a patch
 * on top of the generated body, so cart and option changes still flow in.
 */
export function IntentEditor({
  generated,
  final,
  patch,
  onPatch,
  onValidity,
}: Props) {
  const { resolvedTheme } = useTheme();
  const finalJson = useMemo(() => JSON.stringify(final, null, 2), [final]);
  const [text, setText] = useState(finalJson);
  const [error, setError] = useState<string | null>(null);
  const [lastFinal, setLastFinal] = useState(finalJson);

  // Outside changes (cart, options, flow) replace the text unless it already
  // matches. Invalid JSON in the editor is kept so the user can fix it.
  if (finalJson !== lastFinal) {
    setLastFinal(finalJson);
    if (!error && normalise(text) !== finalJson) setText(finalJson);
  }

  function onChange(value: string | undefined) {
    const next = value ?? '';
    setText(next);
    try {
      const parsed = JSON.parse(next);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('The request must be a JSON object.');
      setError(null);
      onValidity(true);
      onPatch(diffToPatch(generated, parsed));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
      onValidity(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-subtle">
          This is exactly what your backend sends to{' '}
          <code className="font-mono">POST /payments/intent/</code>. Edit
          freely.
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={patchIsEmpty(patch) && !error}
          onClick={() => {
            onPatch({ set: {}, removed: [] });
            setError(null);
            onValidity(true);
            setText(JSON.stringify(generated, null, 2));
          }}
        >
          <RotateCcw className="size-3.5" /> Reset edits
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Editor
          height="420px"
          language="json"
          value={text}
          onChange={onChange}
          theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
      {error && <p className="text-xs text-destructive">JSON error: {error}</p>}
      {!patchIsEmpty(patch) && !error && (
        <p className="text-xs text-subtle">
          Hand edits active on:{' '}
          {[
            ...Object.keys(patch.set),
            ...patch.removed.map(k => `${k} (removed)`),
          ].join(', ')}
        </p>
      )}
    </div>
  );
}

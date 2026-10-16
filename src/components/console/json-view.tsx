'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Small collapsible JSON tree. Objects deeper than `openDepth` start closed. */
export function JsonView({
  value,
  openDepth = 1,
}: {
  value: unknown;
  openDepth?: number;
}) {
  return (
    <div className="font-mono text-[11px] leading-5">
      <Node value={value} depth={0} openDepth={openDepth} />
    </div>
  );
}

function Node({
  name,
  value,
  depth,
  openDepth,
}: {
  name?: string;
  value: unknown;
  depth: number;
  openDepth: number;
}) {
  const isObj = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < openDepth);
  const label = name !== undefined && (
    <span className="text-primary dark:text-sky-300">
      {JSON.stringify(name)}:{' '}
    </span>
  );

  if (!isObj) {
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        {label}
        <Scalar value={value} />
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value as object);
  const [openB, closeB] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];

  if (entries.length === 0) {
    return (
      <div style={{ paddingLeft: depth * 12 }}>
        {label}
        {openB}
        {closeB}
      </div>
    );
  }

  return (
    <div>
      <button
        className="flex items-center text-left hover:bg-muted"
        style={{ paddingLeft: depth * 12 }}
        onClick={() => setOpen(o => !o)}
      >
        <ChevronRight
          className={cn(
            '-ml-3 size-3 shrink-0 transition-transform',
            open && 'rotate-90',
          )}
        />
        {label}
        {openB}
        {!open && (
          <span className="text-subtler">
            {' '}
            {entries.length} {Array.isArray(value) ? 'items' : 'keys'} {closeB}
          </span>
        )}
      </button>
      {open && (
        <>
          {entries.map(([k, v]) => (
            <Node
              key={k}
              name={Array.isArray(value) ? undefined : k}
              value={v}
              depth={depth + 1}
              openDepth={openDepth}
            />
          ))}
          <div style={{ paddingLeft: depth * 12 }}>{closeB}</div>
        </>
      )}
    </div>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (typeof value === 'string')
    return (
      <span className="break-all text-emerald-700 dark:text-emerald-300">
        {JSON.stringify(value)}
      </span>
    );
  if (typeof value === 'number')
    return <span className="text-amber-700 dark:text-amber-300">{value}</span>;
  if (typeof value === 'boolean')
    return (
      <span className="text-violet-700 dark:text-violet-300">
        {String(value)}
      </span>
    );
  return <span className="text-subtler">null</span>;
}

'use client';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMBED_OPTION_GROUPS, EMBED_OPTIONS } from '@/lib/embed-options';
import { useConfig } from '@/store/config';

const DEFAULT_CHOICE = '__default';

export function EmbedOptionsPanel({ usesEmbedUrl }: { usesEmbedUrl: boolean }) {
  const options = useConfig(s => s.embedOptions);
  const setOption = useConfig(s => s.setEmbedOption);

  return (
    <div className="space-y-6">
      {EMBED_OPTION_GROUPS.map(group => {
        const rows = EMBED_OPTIONS.filter(o => o.group === group);
        const disabled = group === 'Embed URL' && !usesEmbedUrl;
        return (
          <div key={group} className="space-y-1">
            <h4 className="text-xs font-medium uppercase tracking-wide text-subtler">
              {group}
              {disabled && <span className="normal-case tracking-normal"> (not used by this flow)</span>}
              {group === 'Redirect URLs' && <span className="normal-case tracking-normal"> (empty = playground order page)</span>}
            </h4>
            <div className="divide-y rounded-md border">
              {rows.map(opt => (
                <div key={opt.key} className="flex items-center gap-4 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {opt.label} <code className="font-mono text-[11px] text-subtler">{opt.key}</code>
                    </p>
                    <p className="text-xs text-subtle">{opt.help}</p>
                  </div>
                  {opt.kind === 'boolean' && (
                    <Switch
                      checked={options[opt.key] === true}
                      onCheckedChange={v => setOption(opt.key, v)}
                      disabled={disabled}
                      aria-label={opt.label}
                    />
                  )}
                  {opt.kind === 'select' && (
                    <Select
                      value={typeof options[opt.key] === 'string' && options[opt.key] ? String(options[opt.key]) : DEFAULT_CHOICE}
                      onValueChange={v => setOption(opt.key, v === DEFAULT_CHOICE ? '' : v)}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={DEFAULT_CHOICE}>Default (not sent)</SelectItem>
                        {opt.choices.map(c => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {(opt.kind === 'text' || opt.kind === 'number' || opt.kind === 'list') && (
                    <input
                      className="h-8 w-48 rounded-sm border border-input bg-transparent px-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
                      inputMode={opt.kind === 'number' ? 'numeric' : undefined}
                      placeholder={'placeholder' in opt ? opt.placeholder : undefined}
                      value={typeof options[opt.key] === 'string' ? String(options[opt.key]) : ''}
                      onChange={e => setOption(opt.key, e.target.value)}
                      aria-label={opt.label}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

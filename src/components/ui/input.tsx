import * as React from 'react';
import { cn } from '@/lib/cn';

// Floating-label input, as in shop.moneyhash.io.
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  containerClassName?: string;
  isError?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, containerClassName, label, isError, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <div className={cn('relative', containerClassName)}>
        <input
          id={inputId}
          ref={ref}
          placeholder=" "
          className={cn(
            'peer block h-10 w-full rounded-sm border border-input bg-transparent px-3 pt-4 pb-1 text-sm text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20',
            isError &&
              'border-red-500 focus:border-red-500 focus:ring-red-500/20',
            className,
          )}
          {...props}
        />
        <label
          htmlFor={inputId}
          className="pointer-events-none absolute end-3 start-3 top-1 truncate whitespace-nowrap text-[10px] text-subtle transition-all peer-placeholder-shown:top-2.5 peer-placeholder-shown:text-sm peer-focus:top-1 peer-focus:text-[10px]"
        >
          {label}
        </label>
      </div>
    );
  },
);
Input.displayName = 'Input';

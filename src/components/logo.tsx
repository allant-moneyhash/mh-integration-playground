import { cn } from '@/lib/cn';

// MoneyHash mark, as on shop.moneyhash.io.
export function MoneyHashLogo({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-label="MoneyHash"
      className={cn('shrink-0 rounded-sm text-foreground', className)}
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M32 0H0v17.5h11.125l.826-2.76H9l.452-2.04h2.99l1.26-4.3h2.577l-1.26 4.3h3.856l1.26-4.3h2.596l-1.259 4.3H32V0Zm0 14.74H20.98l-.826 2.76H23.2l-.469 2.04h-3.069l-1.18 4.06h-2.597l1.2-4.06H13.25l-1.22 4.06H9.453l1.2-4.06H0V32h32V14.74Zm-17.453 0-.806 2.76h3.836l.807-2.76h-3.837Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

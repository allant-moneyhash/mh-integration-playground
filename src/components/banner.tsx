import { MoneyHashLogo } from './logo';

export function Banner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-3xl items-center gap-3 rounded-full border bg-background px-4 py-2 text-sm shadow-lg">
        <MoneyHashLogo width={20} height={20} />
        <p>
          A MoneyHash demo store for showing integrations. Sandbox and test
          cards only.{' '}
          <a
            href="https://docs.moneyhash.io"
            target="_blank"
            rel="noreferrer"
            className="text-indigo-500 hover:underline"
          >
            Docs
          </a>
        </p>
      </div>
    </div>
  );
}

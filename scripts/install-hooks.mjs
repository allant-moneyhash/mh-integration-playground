// Points git at .githooks so the pre-push secret scan runs. Safe to run without git.
import { execSync } from 'node:child_process';

try {
  execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
  // Not a git checkout (or git missing): nothing to do.
}

#!/usr/bin/env node
// Dependency-free secret scan. Runs before every push (.githooks/pre-push) and
// can be run any time with `npm run secret-scan`. CI also runs gitleaks.
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.vercel', 'out', 'coverage']);
const SKIP_FILES = new Set(['package-lock.json', 'scripts/secret-scan.mjs']);
const TEXT_EXT = /\.(m?[jt]sx?|json|md|ya?ml|env.*|css|html|txt|toml)$|^\.env/;

const RULES = [
  // MoneyHash keys look like "<8-char prefix>.<secret>". The random secret always has a
  // digit or capital, which keeps lowercase event names (purchase.pending_…) from matching.
  { name: 'MoneyHash-style API key', re: /\b[A-Za-z0-9]{8}\.(?=[A-Za-z0-9_-]*[A-Z0-9])[A-Za-z0-9_-]{24,}\b/ },
  { name: 'Hard-coded x-api-key value', re: /x-api-key['"]?\s*[:=]\s*['"][A-Za-z0-9._-]{16,}['"]/i },
  { name: 'Assigned secret in env file', re: /^(MH_[A-Z_]*(KEY|SECRET|TOKEN)|UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN)=\S+/m },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
];

function trackedFiles() {
  try {
    return execSync('git ls-files -co --exclude-standard', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
  } catch {
    // No git: walk the tree.
    const out = [];
    const walk = dir => {
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else out.push(relative(ROOT, p).replace(/\\/g, '/'));
      }
    };
    walk(ROOT);
    return out;
  }
}

const findings = [];
for (const file of trackedFiles()) {
  const base = file.split('/').pop();
  if (SKIP_FILES.has(file) || !TEXT_EXT.test(base)) continue;
  if (/^\.env/.test(base) && base !== '.env.example') {
    findings.push(`${file}: env file would be committed`);
    continue;
  }
  let text;
  try {
    text = readFileSync(join(ROOT, file), 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    for (const rule of RULES) if (rule.re.test(line)) findings.push(`${file}:${i + 1}: ${rule.name}`);
  });
}

if (findings.length) {
  console.error('Secret scan failed. Remove these before pushing:\n' + findings.map(f => `  - ${f}`).join('\n'));
  process.exit(1);
}
console.log('Secret scan passed.');

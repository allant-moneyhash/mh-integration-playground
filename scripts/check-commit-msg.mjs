// Conventional commit check (same rule set as @commitlint/config-conventional's types).
import { readFileSync } from 'node:fs';

const TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];
const header = readFileSync(process.argv[2], 'utf8').split(/\r?\n/)[0];
const match = /^(\w+)(\([\w./-]+\))?!?: \S.{0,99}$/.exec(header);
const ok =
  (!!match && TYPES.includes(match[1])) || /^(Merge|Revert) /.test(header);

if (!ok) {
  console.error(
    `Commit message must look like "feat: add bin lookup" (types: ${TYPES.join(', ')}).\nGot: ${header}`,
  );
  process.exit(1);
}

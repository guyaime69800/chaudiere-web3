import { globSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
// Audit scripts may contact providers. Only explicit unit-test files belong here.
const files = [...globSync(['test/**/*.test.js', 'src/**/*.test.js', 'server/**/*.test.js', 'shared/**/*.test.js'])].sort();
if (!files.length) throw Error('No tests found');
const run = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...files], { stdio: 'inherit', env: process.env });
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;

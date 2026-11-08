import { createInterface } from 'node:readline';
import { runCli } from './cli.js';
import { openDatabase } from './db/index.js';

async function readPassword(): Promise<string> {
  if (process.env.PURRSHELF_PASSWORD) return process.env.PURRSHELF_PASSWORD;
  if (process.stdin.isTTY) process.stderr.write('Password: ');
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    rl.close();
    return line;
  }
  return '';
}

const code = await runCli(process.argv.slice(2), {
  env: process.env,
  readPassword,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  openDatabase,
});
process.exit(code);

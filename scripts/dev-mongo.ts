import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const binPath = path.resolve(process.cwd(), '.data/bin/mongod.exe');
const dbPath = path.resolve(process.cwd(), '.data/db');

if (!fs.existsSync(binPath)) {
  console.error(`Local mongod.exe not found at ${binPath}.`);
  process.exit(1);
}

fs.mkdirSync(dbPath, { recursive: true });

console.log(`Starting local MongoDB on 127.0.0.1:27017 with dbPath ${dbPath}`);
const child = spawn(binPath, ['--dbpath', dbPath, '--port', '27017', '--bind_ip', '127.0.0.1'], {
  stdio: 'inherit',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    child.kill(sig);
  });
}

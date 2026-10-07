// Запускает API (с перезапуском при изменениях) и Vite одновременно.
import { spawn } from 'node:child_process';

const procs = [
  spawn('node', ['--disable-warning=ExperimentalWarning', '--watch-path=server', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', stop);

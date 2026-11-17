import { spawn } from 'node:child_process';
import electron from 'electron';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
let desktop;
const stop = () => { vite.kill(); desktop?.kill(); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
try {
  for (let i = 0; ; i++) {
    try { const response = await fetch('http://localhost:5174'); if (response.ok) break; } catch {}
    if (i === 119) throw new Error('Vite did not start');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  desktop = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ELECTRON_DEV_URL: 'http://localhost:5174' } });
  desktop.on('exit', code => { vite.kill(); process.exitCode = code ?? 0; });
} catch (error) { stop(); throw error; }

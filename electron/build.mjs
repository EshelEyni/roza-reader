import { build } from 'esbuild';
await build({ entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], define: { PROJECT_ROOT: JSON.stringify(process.cwd()) }, logLevel: 'warning' });

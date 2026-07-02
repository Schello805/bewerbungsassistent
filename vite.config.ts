import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json' with { type: 'json' };
import { execSync } from 'node:child_process';

function gitValue(command: string, fallback: string) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
}

const commitCount = gitValue('git rev-list --count HEAD', '0');
const commitHash = gitValue('git rev-parse --short HEAD', 'dev');
const revision = `r${commitCount}-${commitHash}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __APP_REVISION__: JSON.stringify(revision),
  },
});

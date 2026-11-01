import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEV-ONLY (temporary): dev-tools build flag — see src/dev/devTools.ts.
// `vite build --mode devtools` (npm run build:devtools) bakes `true`;
// the normal `npm run build` (release/web) bakes `false` — release-safe
// default, so dev tools are compiled out of release builds entirely.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    __LITTLEWINDS_DEV_TOOLS__: JSON.stringify(mode === 'devtools'),
  },
}));

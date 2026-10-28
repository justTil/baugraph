/// <reference types="vite/client" />

/** The contents of `version.txt`, baked in at build time (see `vite.config.ts`). */
declare const __APP_VERSION__: string

/** The day the build was made as `YYYY-MM-DD`, baked in at build time (see `vite.config.ts`). */
declare const __BUILD_DATE__: string

/** Whether this is the self-hosted Docker build, baked in at build time (see `vite.config.ts`). */
declare const __SELF_HOSTED__: boolean

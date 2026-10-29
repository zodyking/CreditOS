import { createError } from 'h3'

// Nitro auto-imports `createError` in server code; provide it for unit tests.
;(globalThis as unknown as { createError: typeof createError }).createError = createError

process.env.APP_MODE ??= 'demo'
process.env.DATA_DIR ??= '/tmp/creditos-test-data'

import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { APP_MODES, type AppMode } from '#shared/constants'
import { env } from './env'

const FILE_NAME = 'app-mode.json'

function filePath(): string {
  return resolve(env.dataDir, FILE_NAME)
}

function parseMode(value: unknown): AppMode | null {
  return typeof value === 'string' && (APP_MODES as readonly string[]).includes(value) ? (value as AppMode) : null
}

/** The mode chosen in the app. Environment variables are not consulted. */
export function readSavedAppMode(): AppMode | null {
  const path = filePath()
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { mode?: unknown }
    return parseMode(parsed.mode)
  } catch {
    return null
  }
}

export function appModeChosen(): boolean {
  return readSavedAppMode() !== null
}

export async function saveAppMode(mode: AppMode): Promise<void> {
  const path = filePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify({ mode }), { mode: 0o600 })
}

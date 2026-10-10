import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GeneratedSources } from './generator'
import { assertSource } from './validation'

export const SOURCE_FILES = { stable: 'apps.json', beta: 'apps-beta.json' } as const
export const LEGACY_SOURCE_FILES = { stable: 'apps-old.json', beta: 'apps-old-beta.json' } as const

export const readPreviousSources = async (
  directory = 'generated'
): Promise<Partial<GeneratedSources>> => {
  const previous: Partial<GeneratedSources> = {}
  for (const channel of ['stable', 'beta'] as const) {
    const file = Bun.file(join(directory, SOURCE_FILES[channel]))
    if (!(await file.exists())) continue
    const source: unknown = await file.json()
    // The old combined source has fabricated beta IDs and unverified versions.
    // It must be re-probed, never carried forward as verified metadata.
    if (
      channel === 'stable' &&
      source &&
      typeof source === 'object' &&
      Array.isArray((source as { apps?: unknown }).apps) &&
      (source as { apps: unknown[] }).apps.length === 2 &&
      !(await Bun.file(join(directory, SOURCE_FILES.beta)).exists())
    ) {
      console.warn('[warn] 正在迁移旧的双条目源；旧数据需要重新探测。')
      continue
    }
    assertSource(source, channel)
    previous[channel] = source
  }
  return previous
}

export const writeSources = async (
  sources: GeneratedSources,
  directory = 'generated'
): Promise<void> => {
  // Validate both files before touching either published file.
  assertSource(sources.stable, 'stable')
  assertSource(sources.beta, 'beta')
  await mkdir(directory, { recursive: true })
  const files = await Promise.all(
    (['stable', 'beta'] as const).map(async (channel) => {
      const path = join(directory, SOURCE_FILES[channel])
      const original = await readFile(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      return {
        path,
        temporary: `${path}.${process.pid}.tmp`,
        original,
        content: `${JSON.stringify(sources[channel], null, 2)}\n`,
      }
    })
  )
  const replaced: typeof files = []
  try {
    for (const file of files) await writeFile(file.temporary, file.content)
    for (const file of files) {
      await rename(file.temporary, file.path)
      replaced.push(file)
    }
  } catch (error) {
    for (const file of replaced) {
      if (file.original === null) await rm(file.path, { force: true })
      else {
        await writeFile(file.temporary, file.original)
        await rename(file.temporary, file.path)
      }
    }
    throw error
  } finally {
    for (const file of files) await rm(file.temporary, { force: true })
  }
}

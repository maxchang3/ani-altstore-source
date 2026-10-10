import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  assertIpaMetadata,
  type Fetcher,
  type IpaMetadata,
  normalizeDownloadURL,
  probeIpa,
} from './ipa'

interface CacheEntry {
  probedAt: number
  metadata: IpaMetadata
}

interface CacheOptions {
  reprobe?: boolean
  maxAgeMs?: number
  fetcher?: Fetcher
  now?: () => number
}

export const IPA_CACHE_PATH = '.cache/ipa-metadata.json'

export class IpaMetadataCache {
  private readonly entries: Record<string, CacheEntry> = {}
  private readonly pending = new Map<string, Promise<IpaMetadata>>()

  constructor(private readonly options: CacheOptions = {}) {}

  async load(path: string = IPA_CACHE_PATH): Promise<void> {
    const file = Bun.file(path)
    if (!(await file.exists())) return
    try {
      const data = await file.json()
      if (data.schemaVersion !== 1 || !data.entries || typeof data.entries !== 'object') return
      for (const [url, entry] of Object.entries(data.entries)) {
        try {
          const item = entry as CacheEntry
          assertIpaMetadata(item.metadata)
          if (typeof item.probedAt === 'number' && Number.isFinite(item.probedAt)) {
            this.entries[url] = item
          }
        } catch {
          // Ignore invalid entries so they are probed again.
        }
      }
    } catch {
      console.warn('[warn] IPA 缓存无法读取，将重新探测。')
    }
  }

  async probe(url: string): Promise<IpaMetadata> {
    const normalizedURL = normalizeDownloadURL(url)
    const now = (this.options.now ?? Date.now)()
    const cached = this.entries[normalizedURL]
    const age = cached ? now - cached.probedAt : Number.POSITIVE_INFINITY
    if (
      !this.options.reprobe &&
      cached &&
      age >= 0 &&
      age < (this.options.maxAgeMs ?? 7 * 86_400_000)
    ) {
      return cached.metadata
    }
    let job = this.pending.get(normalizedURL)
    if (!job) {
      job = probeIpa(normalizedURL, this.options.fetcher)
        .then((metadata) => {
          this.entries[normalizedURL] = { probedAt: (this.options.now ?? Date.now)(), metadata }
          return metadata
        })
        .finally(() => this.pending.delete(normalizedURL))
      this.pending.set(normalizedURL, job)
    }
    return job
  }

  async save(path: string = IPA_CACHE_PATH): Promise<void> {
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.tmp`
    try {
      const entries = Object.fromEntries(
        Object.entries(this.entries).sort(([a], [b]) => a.localeCompare(b))
      )
      await Bun.write(temporary, `${JSON.stringify({ schemaVersion: 1, entries }, null, 2)}\n`)
      await rename(temporary, path)
    } finally {
      await rm(temporary, { force: true })
    }
  }
}

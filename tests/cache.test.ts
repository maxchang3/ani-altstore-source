import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpaMetadataCache } from '../src/cache'
import { makeIpa, rangeServer } from './fixtures'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('deduplicates concurrent probes and persists fresh metadata across runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ani-cache-'))
  directories.push(directory)
  const path = join(directory, 'metadata.json')
  const server = rangeServer(makeIpa())
  const cache = new IpaMetadataCache({ fetcher: server.fetcher, now: () => 1000 })
  const [a, b] = await Promise.all([
    cache.probe('https://example.com/app.ipa'),
    cache.probe('https://ghfast.top/https://example.com/app.ipa'),
  ])
  expect(a).toEqual(b)
  expect(server.calls).toHaveLength(4)
  await cache.save(path)
  const restored = new IpaMetadataCache({
    fetcher: async () => {
      throw new Error('Unexpected network request')
    },
    now: () => 1001,
  })
  await restored.load(path)
  expect(await restored.probe('https://example.com/app.ipa')).toEqual(a)
})

test('expired and explicitly invalidated caches are probed again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ani-cache-'))
  directories.push(directory)
  const path = join(directory, 'metadata.json')
  const server = rangeServer(makeIpa())
  const initial = new IpaMetadataCache({ fetcher: server.fetcher, now: () => 1000 })
  await initial.probe('https://example.com/app.ipa')
  await initial.save(path)
  const expired = new IpaMetadataCache({ fetcher: server.fetcher, now: () => 2000, maxAgeMs: 500 })
  await expired.load(path)
  await expired.probe('https://example.com/app.ipa')
  expect(server.calls).toHaveLength(8)
  const forced = new IpaMetadataCache({ fetcher: server.fetcher, now: () => 1001, reprobe: true })
  await forced.load(path)
  await forced.probe('https://example.com/app.ipa')
  expect(server.calls).toHaveLength(12)
})

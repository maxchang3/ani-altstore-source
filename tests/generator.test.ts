import { afterEach, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSources } from '../src/generator'
import { readPreviousSources, writeSources } from '../src/output'
import { LEGACY_APP_BUNDLE_IDENTIFIER } from '../src/releases'
import { updateToSourceVersion } from '../src/utils'
import { assertSource, assertUpdates } from '../src/validation'
import { makeUpdate, metadata, resolveFixture } from './fixtures'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

const updates = [makeUpdate('6.2.0'), makeUpdate('6.3.0-beta01', 1_700_000_100)]
const generate = () => generateSources({ updates, resolveIpa: resolveFixture })

const legacySources = async () => {
  const sources = await generate()
  for (const channel of ['stable', 'beta'] as const) {
    const source = sources[channel]
    source.featuredApps = [LEGACY_APP_BUNDLE_IDENTIFIER]
    source.apps[0].bundleIdentifier = LEGACY_APP_BUNDLE_IDENTIFIER
    source.apps[0].versions[0] = {
      ...source.apps[0].versions[0],
      releaseTag: channel === 'stable' ? '5.3.2' : '5.3.0-beta01',
      version: channel === 'stable' ? '5.3.2' : '5.3.0',
      buildVersion: '30200',
    }
  }
  return sources
}

test('validates legacy channels without accepting current IDs or releases', async () => {
  const sources = await legacySources()
  expect(() => assertSource(sources.stable, 'stable', 'legacy')).not.toThrow()
  expect(() => assertSource(sources.beta, 'beta', 'legacy')).not.toThrow()
  expect(() => assertSource(sources.beta, 'beta')).toThrow('Bundle ID')

  const currentID = structuredClone(sources.stable)
  currentID.apps[0].bundleIdentifier = metadata.bundleIdentifier
  expect(() => assertSource(currentID, 'stable', 'legacy')).toThrow('Bundle ID')

  const currentRelease = structuredClone(sources.stable)
  currentRelease.apps[0].versions[0].releaseTag = '5.4.0'
  expect(() => assertSource(currentRelease, 'stable', 'legacy')).toThrow('分类错误')

  const wrongChannel = structuredClone(sources.beta)
  wrongChannel.apps[0].versions[0].releaseTag = '5.3.0'
  expect(() => assertSource(wrongChannel, 'beta', 'legacy')).toThrow('分类错误')

  const duplicateBuild = structuredClone(sources.beta)
  duplicateBuild.apps[0].versions.push({
    ...duplicateBuild.apps[0].versions[0],
    releaseTag: '5.3.0-alpha02',
  })
  expect(() => assertSource(duplicateBuild, 'beta', 'legacy')).toThrow('重复版本与 build')
})

test('classifies using tags while declaring real IPA versions in separate sources', async () => {
  const sources = await generate()
  expect(sources.stable.apps).toHaveLength(1)
  expect(sources.beta.apps).toHaveLength(1)
  expect(sources.stable.apps[0].bundleIdentifier).toBe(metadata.bundleIdentifier)
  expect(sources.beta.apps[0].bundleIdentifier).toBe(metadata.bundleIdentifier)
  expect(sources.stable.apps[0].versions[0].releaseTag).toBe('6.2.0')
  expect(sources.beta.apps[0].versions[0].version).toBe('6.3.0')
  expect(sources.beta.apps[0].versions[0].releaseTag).toBe('6.3.0-beta01')
  expect(sources.beta.apps[0].versions[0].localizedDescription).toContain('🧪 预发布 6.3.0-beta01')
  expect(sources.beta.apps[0].beta).toBe(true)
})

test('preserves known releases on probe failure and skips unverified new releases', async () => {
  const previous = await generate()
  const sources = await generateSources({
    updates: [...updates, makeUpdate('6.3.0-beta02', 1_700_000_200)],
    previous,
    resolveIpa: async () => {
      throw new Error('Network unavailable')
    },
  })
  expect(sources).toEqual(previous)
})

test('keeps older records omitted by an incremental response and preserves distinct builds', async () => {
  const previous = await generate()
  const sources = await generateSources({
    updates: [makeUpdate('6.3.0-beta02', 1_700_000_200)],
    previous,
    resolveIpa: resolveFixture,
  })
  expect(sources.stable).toEqual(previous.stable)
  expect(sources.beta.apps[0].versions.map((v) => v.releaseTag)).toEqual([
    '6.3.0-beta02',
    '6.3.0-beta01',
  ])
  expect(sources.beta.apps[0].versions.map((v) => v.version)).toEqual(['6.3.0', '6.3.0'])
})

test('rejects empty or invalid upstream responses before probing or writing', async () => {
  const resolveIpa = mock(resolveFixture)
  await expect(generateSources({ updates: [], resolveIpa })).rejects.toThrow('空列表')
  expect(resolveIpa).not.toHaveBeenCalled()
  expect(() => assertUpdates({ updates: [{ ...updates[0], publishTime: 'bad' }] })).toThrow(
    '发布时间'
  )
})

test('rejects an empty source rather than emitting an unusable source', async () => {
  await expect(
    generateSources({ updates: [updates[0]], resolveIpa: resolveFixture })
  ).rejects.toThrow('beta 版本列表不能为空')
})

test('tries mirrors sequentially and reuses the previously successful URL', async () => {
  const update = {
    ...updates[1],
    downloadUrlAlternatives: [
      'https://example.com/first.ipa',
      'https://example.com/second.ipa',
      'https://example.com/third.ipa',
    ],
  }
  const calls: string[] = []
  const resolve = async (url: string) => {
    calls.push(url)
    if (url.endsWith('first.ipa')) throw new Error('Unavailable')
    return metadata
  }
  const first = await updateToSourceVersion(update, resolve)
  expect(calls).toEqual(update.downloadUrlAlternatives.slice(0, 2))
  calls.length = 0
  await updateToSourceVersion(update, resolve, first?.downloadURL)
  expect(calls).toEqual(['https://example.com/second.ipa'])
})

test('rejects an IPA with an unexpected bundle identifier', async () => {
  expect(
    await updateToSourceVersion(updates[1], async () => ({
      ...metadata,
      bundleIdentifier: 'fake.beta.id',
    }))
  ).toBeNull()
})

test('does not modify either existing file when validation or staging fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ani-sources-'))
  directories.push(directory)
  const sources = await generate()
  await writeSources(sources, directory)
  const stablePath = join(directory, 'apps.json')
  const betaPath = join(directory, 'apps-beta.json')
  const originals = await Promise.all([readFile(stablePath, 'utf8'), readFile(betaPath, 'utf8')])
  const invalid = structuredClone(sources)
  invalid.beta.apps[0].versions = []
  await expect(writeSources(invalid, directory)).rejects.toThrow('不能为空')
  expect(await Promise.all([readFile(stablePath, 'utf8'), readFile(betaPath, 'utf8')])).toEqual(
    originals
  )
  await mkdir(`${betaPath}.${process.pid}.tmp`)
  await expect(writeSources(sources, directory)).rejects.toThrow()
  expect(await Promise.all([readFile(stablePath, 'utf8'), readFile(betaPath, 'utf8')])).toEqual(
    originals
  )
})

test('rejects legacy fabricated IDs and wrong-channel tags', async () => {
  const sources = await generate()
  const wrongTag = structuredClone(sources.beta)
  wrongTag.apps[0].versions[0].releaseTag = '6.3.0'
  expect(() => assertSource(wrongTag, 'beta')).toThrow('分类错误')
  const wrongID = structuredClone(sources.beta)
  wrongID.apps[0].bundleIdentifier += '.beta'
  expect(() => assertSource(wrongID, 'beta')).toThrow('Bundle ID')
})

test('loads validated previous sources for the next run', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ani-sources-'))
  directories.push(directory)
  const sources = await generate()
  await writeSources(sources, directory)
  expect(await readPreviousSources(directory)).toEqual(sources)
})

for (const status of [503, 200]) {
  test(`CLI preserves both files when the update API ${status === 503 ? 'fails' : 'returns an empty list'}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ani-cli-'))
    directories.push(directory)
    const output = join(directory, 'generated')
    await writeSources(await generate(), output)
    const paths = [join(output, 'apps.json'), join(output, 'apps-beta.json')]
    const before = await Promise.all(paths.map((path) => readFile(path, 'utf8')))
    const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url))
    const script = `globalThis.fetch = Object.assign(async () => new Response(JSON.stringify({ updates: [] }), { status: ${status} }), { preconnect: fetch.preconnect }); await import(${JSON.stringify(entry)})`
    const process = Bun.spawn([Bun.which('bun') ?? 'bun', '--eval', script], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(await process.exited).not.toBe(0)
    expect(await new Response(process.stderr).text()).toContain(
      status === 503 ? 'Failed to fetch updates' : '空列表'
    )
    expect(await Promise.all(paths.map((path) => readFile(path, 'utf8')))).toEqual(before)
  })
}

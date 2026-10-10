import { expect, test } from 'bun:test'
import { probeIpa } from '../src/ipa'
import { makeIpa, metadata, rangeServer } from './fixtures'

for (const binary of [false, true]) {
  test(`extracts main-app ${binary ? 'binary' : 'XML'} plist without downloading the archive`, async () => {
    const archive = makeIpa(binary)
    const server = rangeServer(archive)
    const result = await probeIpa('https://example.com/app.ipa', server.fetcher)
    expect(result).toEqual({ ...metadata, size: archive.length })
    expect(server.calls).toHaveLength(4)
    expect(server.calls).not.toContain(null)
    expect(server.transferred()).toBeLessThan(70_000)
    expect(server.transferred()).toBeLessThan(archive.length)
  })
}

test('reuses full response when server ignores the initial Range', async () => {
  const archive = makeIpa()
  const server = rangeServer(archive, 'ignore')
  expect(await probeIpa('https://example.com/app.ipa', server.fetcher)).toEqual({
    ...metadata,
    size: archive.length,
  })
  expect(server.calls).toEqual(['bytes=0-0'])
  expect(server.transferred()).toBe(archive.length)
})

for (const mode of ['invalid', 'corrupt', 'unsupported'] as const) {
  test(`falls back to a full archive for ${mode} Range responses`, async () => {
    const archive = makeIpa()
    const server = rangeServer(archive, mode)
    expect(await probeIpa('https://example.com/app.ipa', server.fetcher)).toEqual({
      ...metadata,
      size: archive.length,
    })
    expect(server.calls.at(-1)).toBe(null)
  })
}

test('HTTP download failures are not retried as full downloads', async () => {
  let calls = 0
  await expect(
    probeIpa('https://example.com/app.ipa', async () => {
      calls++
      return new Response(null, { status: 403 })
    })
  ).rejects.toThrow('HTTP 403')
  expect(calls).toBe(1)
})

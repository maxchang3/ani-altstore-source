import { strToU8, zipSync } from 'fflate'
import { build } from 'plist'
import type { Fetcher, IpaMetadata } from '../src/ipa'
import type { Update } from '../src/types'

export const metadata: IpaMetadata = {
  bundleIdentifier: 'org.animeko.animeko',
  version: '6.3.0',
  buildVersion: '6.3.31',
  minOSVersion: '14.0',
  size: 200_000,
}

const binaryPlist =
  'YnBsaXN0MDDUAQIDBAUGBwhfEBJDRkJ1bmRsZUlkZW50aWZpZXJfEBpDRkJ1bmRsZVNob3J0VmVyc2lvblN0cmluZ18QD0NGQnVuZGxlVmVyc2lvbl8QEE1pbmltdW1PU1ZlcnNpb25fEBNvcmcuYW5pbWVrby5hbmltZWtvVTYuMy4wVjYuMy4zMVQxNC4wCBEmQ1VofoSLAAAAAAAAAQEAAAAAAAAACQAAAAAAAAAAAAAAAAAAAJA='

export const makeIpa = (binary = false): Uint8Array =>
  zipSync({
    'Payload/Animeko.app/Info.plist': binary
      ? new Uint8Array(Buffer.from(binaryPlist, 'base64'))
      : strToU8(
          build({
            CFBundleIdentifier: metadata.bundleIdentifier,
            CFBundleShortVersionString: metadata.version,
            CFBundleVersion: metadata.buildVersion,
            MinimumOSVersion: metadata.minOSVersion,
          })
        ),
    'Payload/Animeko.app/PlugIns/Widget.appex/Info.plist': strToU8(
      build({ CFBundleIdentifier: 'wrong.extension.id' })
    ),
    'Payload/Animeko.app/content.bin': [new Uint8Array(200_000), { level: 0 }],
  })

export const rangeServer = (
  archive: Uint8Array,
  mode: 'range' | 'ignore' | 'invalid' | 'corrupt' | 'unsupported' = 'range'
) => {
  const calls: Array<string | null> = []
  let transferred = 0
  const fetcher: Fetcher = async (_url, init) => {
    const range = new Headers(init?.headers).get('Range')
    calls.push(range)
    if (mode === 'unsupported' && range) return new Response(null, { status: 501 })
    if (!range || mode === 'ignore') {
      transferred += archive.length
      return new Response(archive.slice(), { status: 200 })
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(range)
    if (!match) throw new Error('Expected explicit byte range')
    const start = Number(match[1])
    const end = Number(match[2])
    const data = archive.slice(start, end + 1)
    if (mode === 'corrupt' && start > 0 && start < 2000) data[data.length - 1] ^= 1
    transferred += data.length
    return new Response(data, {
      status: 206,
      headers: {
        'Content-Range':
          mode === 'invalid' ? 'bytes 1-1/10' : `bytes ${start}-${end}/${archive.length}`,
      },
    })
  }
  return { fetcher, calls, transferred: () => transferred }
}

export const makeUpdate = (tag: string, publishTime = 1_700_000_000): Update => ({
  version: tag,
  publishTime,
  description: 'Release notes',
  downloadUrlAlternatives: [`https://example.com/${tag}.ipa`],
})

export const resolveFixture = async (url: string): Promise<IpaMetadata> => {
  const tag = new URL(url).pathname.replace(/^\//, '').replace(/\.ipa$/, '')
  return { ...metadata, version: tag.split('-')[0], buildVersion: tag }
}

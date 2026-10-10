import { parseBuffer } from 'bplist-parser'
import { inflateSync, strFromU8, unzipSync } from 'fflate'
import { parse } from 'plist'

export interface IpaMetadata {
  bundleIdentifier: string
  version: string
  buildVersion: string
  minOSVersion: string
  size: number
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
const INFO_PLIST_PATH = /^Payload\/[^/]+\.app\/Info\.plist$/
const MAX_PLIST_SIZE = 2 * 1024 * 1024
const MAX_DIRECTORY_SIZE = 8 * 1024 * 1024
const TIMEOUT_MS = 30_000

class RangeProbeError extends Error {}
class DownloadError extends Error {}

export const normalizeDownloadURL = (url: string): string =>
  url.replace(/^https:\/\/ghfast\.top\//, '')

const requireRange = (condition: boolean, message: string): void => {
  if (!condition) throw new RangeProbeError(message)
}

export function assertIpaMetadata(value: unknown): asserts value is IpaMetadata {
  if (!value || typeof value !== 'object') throw new Error('无效的 IPA 元数据')
  const metadata = value as Record<string, unknown>
  for (const field of ['bundleIdentifier', 'version', 'buildVersion', 'minOSVersion']) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw new Error(`IPA 缺少有效的 ${field}`)
    }
  }
  if (!Number.isSafeInteger(metadata.size) || (metadata.size as number) <= 0) {
    throw new Error('IPA 大小无效')
  }
  for (const field of ['version', 'minOSVersion']) {
    if (!/^\d+(?:\.\d+){0,2}$/.test(metadata[field] as string)) {
      throw new Error(`IPA 的 ${field} 格式无效`)
    }
  }
}

const metadataFromPlist = (bytes: Uint8Array, size: number): IpaMetadata => {
  const root: unknown =
    strFromU8(bytes.subarray(0, 6)) === 'bplist'
      ? parseBuffer(Buffer.from(bytes))[0]
      : parse(strFromU8(bytes))
  if (!root || typeof root !== 'object') throw new Error('Info.plist 解析结果无效')
  const info = root as Record<string, unknown>
  const metadata = {
    bundleIdentifier: info.CFBundleIdentifier,
    version: info.CFBundleShortVersionString,
    buildVersion: info.CFBundleVersion,
    minOSVersion: info.MinimumOSVersion,
    size,
  }
  assertIpaMetadata(metadata)
  return metadata
}

const metadataFromArchive = (bytes: Uint8Array): IpaMetadata => {
  const entries = unzipSync(bytes, {
    filter: (entry) => INFO_PLIST_PATH.test(entry.name) && entry.originalSize <= MAX_PLIST_SIZE,
  })
  const paths = Object.keys(entries)
  if (paths.length !== 1) throw new Error('IPA 必须包含唯一的主应用 Info.plist')
  return metadataFromPlist(entries[paths[0]], bytes.byteLength)
}

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const request = (fetcher: Fetcher, url: string, range?: string): Promise<Response> =>
  fetcher(url, {
    headers: { 'Accept-Encoding': 'identity', ...(range ? { Range: `bytes=${range}` } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })

const readPartialResponse = async (
  response: Response,
  start: number,
  end: number,
  expectedSize?: number
): Promise<{ bytes: Uint8Array; size: number }> => {
  if (response.status !== 206) {
    await response.body?.cancel()
    if ([200, 405, 416, 501].includes(response.status)) {
      throw new RangeProbeError(`Range 请求未被正确处理: HTTP ${response.status}`)
    }
    throw new DownloadError(`下载 IPA 失败: HTTP ${response.status}`)
  }
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '')
  if (
    !match ||
    Number(match[1]) !== start ||
    Number(match[2]) !== end ||
    !Number.isSafeInteger(Number(match[3])) ||
    Number(match[3]) <= end ||
    (expectedSize !== undefined && Number(match[3]) !== expectedSize)
  ) {
    await response.body?.cancel()
    throw new RangeProbeError('无效或变化的 Content-Range')
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  requireRange(bytes.byteLength === end - start + 1, 'Range 响应长度不符')
  return { bytes, size: Number(match[3]) }
}

const probeRanges = async (
  url: string,
  fetcher: Fetcher,
  first: Response
): Promise<IpaMetadata> => {
  const { size } = await readPartialResponse(first, 0, 0)
  const read = async (start: number, end: number): Promise<Uint8Array> => {
    requireRange(start >= 0 && end >= start && end < size, 'ZIP 字节范围越界')
    return (
      await readPartialResponse(await request(fetcher, url, `${start}-${end}`), start, end, size)
    ).bytes
  }

  const tailStart = Math.max(0, size - 65_557)
  const tail = await read(tailStart, size - 1)
  const tailView = viewOf(tail)
  let eocd = -1
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (
      tailView.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + tailView.getUint16(offset + 20, true) === tail.length
    ) {
      eocd = offset
      break
    }
  }
  requireRange(eocd >= 0, '未找到 ZIP 中央目录尾记录')
  const count = tailView.getUint16(eocd + 10, true)
  const directorySize = tailView.getUint32(eocd + 12, true)
  const directoryOffset = tailView.getUint32(eocd + 16, true)
  requireRange(
    tailView.getUint16(eocd + 4, true) === 0 &&
      tailView.getUint16(eocd + 6, true) === 0 &&
      tailView.getUint16(eocd + 8, true) === count,
    '不支持多卷 ZIP'
  )
  // ZIP64 and oversized directories use the full-download parser instead.
  requireRange(
    count !== 0xffff &&
      directoryOffset !== 0xffffffff &&
      directorySize > 0 &&
      directorySize <= MAX_DIRECTORY_SIZE &&
      directoryOffset + directorySize <= tailStart + eocd,
    'ZIP 目录需要完整下载解析'
  )
  const directory =
    directoryOffset >= tailStart
      ? tail.subarray(directoryOffset - tailStart, directoryOffset - tailStart + directorySize)
      : await read(directoryOffset, directoryOffset + directorySize - 1)
  const directoryView = viewOf(directory)
  const matches: Array<{
    name: string
    offset: number
    compressedSize: number
    size: number
    method: number
    crc: number
  }> = []
  let cursor = 0
  for (let index = 0; index < count; index++) {
    requireRange(
      cursor + 46 <= directory.length && directoryView.getUint32(cursor, true) === 0x02014b50,
      'ZIP 目录记录无效'
    )
    const nameLength = directoryView.getUint16(cursor + 28, true)
    const recordLength =
      46 +
      nameLength +
      directoryView.getUint16(cursor + 30, true) +
      directoryView.getUint16(cursor + 32, true)
    requireRange(cursor + recordLength <= directory.length, 'ZIP 目录记录被截断')
    const name = strFromU8(directory.subarray(cursor + 46, cursor + 46 + nameLength))
    if (INFO_PLIST_PATH.test(name)) {
      requireRange((directoryView.getUint16(cursor + 8, true) & 1) === 0, 'Info.plist 被加密')
      matches.push({
        name,
        offset: directoryView.getUint32(cursor + 42, true),
        compressedSize: directoryView.getUint32(cursor + 20, true),
        size: directoryView.getUint32(cursor + 24, true),
        method: directoryView.getUint16(cursor + 10, true),
        crc: directoryView.getUint32(cursor + 16, true),
      })
    }
    cursor += recordLength
  }
  requireRange(matches.length === 1, 'IPA 必须包含唯一的主应用 Info.plist')
  const entry = matches[0]
  requireRange(
    entry.size > 0 &&
      entry.size <= MAX_PLIST_SIZE &&
      entry.compressedSize > 0 &&
      entry.compressedSize <= MAX_PLIST_SIZE &&
      [0, 8].includes(entry.method),
    'Info.plist 需要完整下载解析'
  )
  const local = viewOf(await read(entry.offset, entry.offset + 29))
  requireRange(
    local.getUint32(0, true) === 0x04034b50 &&
      local.getUint16(8, true) === entry.method &&
      (local.getUint16(6, true) & 1) === 0,
    'ZIP 本地头无效'
  )
  const nameLength = local.getUint16(26, true)
  const prefixLength = nameLength + local.getUint16(28, true)
  const dataStart = entry.offset + 30
  requireRange(
    dataStart + prefixLength + entry.compressedSize <= directoryOffset,
    'Info.plist 数据越界'
  )
  const payload = await read(dataStart, dataStart + prefixLength + entry.compressedSize - 1)
  requireRange(strFromU8(payload.subarray(0, nameLength)) === entry.name, 'ZIP 文件名不一致')
  const compressed = payload.subarray(prefixLength)
  let bytes: Uint8Array
  try {
    bytes =
      entry.method === 8 ? inflateSync(compressed, { out: new Uint8Array(entry.size) }) : compressed
  } catch (error) {
    throw new RangeProbeError('Info.plist 解压失败', { cause: error })
  }
  requireRange(
    bytes.length === entry.size && Bun.hash.crc32(bytes) === entry.crc,
    'Info.plist 长度或 CRC 校验失败'
  )
  return metadataFromPlist(bytes, size)
}

export const probeIpa = async (url: string, fetcher: Fetcher = fetch): Promise<IpaMetadata> => {
  const normalizedURL = normalizeDownloadURL(url)
  try {
    const first = await request(fetcher, normalizedURL, '0-0')
    // A server ignoring the first Range already returned the full archive: reuse it.
    if (first.status === 200) {
      return metadataFromArchive(new Uint8Array(await first.arrayBuffer()))
    }
    return await probeRanges(normalizedURL, fetcher, first)
  } catch (error) {
    if (!(error instanceof RangeProbeError)) throw error
    const response = await request(fetcher, normalizedURL)
    if (response.status !== 200) {
      await response.body?.cancel()
      throw new DownloadError(`完整下载 IPA 失败: HTTP ${response.status}`)
    }
    return metadataFromArchive(new Uint8Array(await response.arrayBuffer()))
  }
}

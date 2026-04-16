import { parseBuffer } from 'bplist-parser'
import { strFromU8, unzipSync } from 'fflate'
import { parse } from 'plist'
import type { SourceVersion, Update } from './types'

// Extract from plist
const DEFAULT_MIN_OS_VERSION = '14.0'

interface IpaVersionResult {
  normalizedURL: string
  size: number
  buildVersion: string
}

interface InfoPlist extends Record<string, unknown> {
  CFBundleVersion?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object'

const normalizeDownloadURL = (url: string) =>
  url.startsWith('https://ghfast.top/') ? url.replace('https://ghfast.top/', '') : url

const parseInfoPlist = (plistBytes: Uint8Array, sourceUrl: string): InfoPlist => {
  const header = strFromU8(plistBytes.subarray(0, 6))

  if (header === 'bplist') {
    const parsed = parseBuffer(Buffer.from(plistBytes))
    const root = parsed[0]
    if (isRecord(root)) return root
    throw new Error(`${sourceUrl} 的二进制 Info.plist 解析结果无效`)
  }

  const plistContent = strFromU8(plistBytes)
  const parsed = parse(plistContent)
  if (isRecord(parsed)) return parsed

  throw new Error(`${sourceUrl} 的 XML Info.plist 解析结果无效`)
}

const normalizeBuildVersion = (value: InfoPlist['CFBundleVersion'], sourceUrl: string): string => {
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length > 0) return normalized
  }

  throw new Error(`${sourceUrl} 的 Info.plist 缺少有效的 CFBundleVersion`)
}

const extractBuildVersionFromIpa = (ipaBuffer: ArrayBuffer, sourceUrl: string): string => {
  const zipEntries = unzipSync(new Uint8Array(ipaBuffer))
  const infoPlistPath = Object.keys(zipEntries).find((entry) =>
    /^Payload\/[^/]+\.app\/Info\.plist$/.test(entry)
  )

  if (!infoPlistPath) throw new Error(`${sourceUrl} 内未找到 Payload/*.app/Info.plist`)

  const plistData = parseInfoPlist(zipEntries[infoPlistPath], sourceUrl)
  return normalizeBuildVersion(plistData.CFBundleVersion, sourceUrl)
}

const downloadAndExtractBuildVersion = async (
  url: string,
  signal?: AbortSignal
): Promise<IpaVersionResult> => {
  const normalizedURL = normalizeDownloadURL(url)
  const response = await fetch(normalizedURL, { signal })

  if (!response.ok) throw new Error(`下载 IPA 失败: HTTP ${response.status}`)

  const ipaBuffer = await response.arrayBuffer()
  const contentLength = response.headers.get('content-length')
  const parsedContentLength = contentLength ? parseInt(contentLength, 10) : Number.NaN
  const size = Number.isNaN(parsedContentLength) ? ipaBuffer.byteLength : parsedContentLength

  return {
    normalizedURL,
    size,
    buildVersion: extractBuildVersionFromIpa(ipaBuffer, normalizedURL),
  }
}

export const timestampToISO = (timestamp: number) => new Date(timestamp * 1000).toISOString()

export const updateToSourceVersion = async (update: Update): Promise<SourceVersion | null> => {
  if (update.downloadUrlAlternatives.length === 0) {
    console.warn(`[warn] ${update.version} 无可用的下载链接。`)
    return null
  }

  const abortController = new AbortController()
  const jobs = update.downloadUrlAlternatives.map((url) =>
    downloadAndExtractBuildVersion(url, abortController.signal)
  )

  try {
    const firstSuccess = await Promise.any(jobs)
    abortController.abort()

    return {
      version: update.version,
      date: timestampToISO(update.publishTime),
      localizedDescription: update.description,
      downloadURL: firstSuccess.normalizedURL,
      size: firstSuccess.size,
      buildVersion: firstSuccess.buildVersion,
      minOSVersion: DEFAULT_MIN_OS_VERSION,
    }
  } catch {
    console.warn(`[warn] ${update.version} 无可用的下载链接或无法解析 IPA。`)
    return null
  }
}

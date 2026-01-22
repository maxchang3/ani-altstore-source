import type { SourceVersion, Update } from './types'

interface FileSizeResult {
  size: number | null
  status: number
  error?: string
}

// Fixed build version:
// https://github.com/open-ani/animeko/blob/fd3991935017e8513c9c795c8deb280599ec0685/app/ios/build.gradle.kts#L272
// https://github.com/open-ani/animeko/blob/fd3991935017e8513c9c795c8deb280599ec0685/gradle.properties#L21
const DEFAULT_BUILD_VERSION = '30200'
// Extract from plist
const DEFAULT_MIN_OS_VERSION = '14.0'

export const timestampToISO = (timestamp: number) => new Date(timestamp * 1000).toISOString()

export const getFileSizeFromHEAD = async (url: string): Promise<FileSizeResult> => {
  try {
    const response = await fetch(url, { method: 'HEAD' })

    if (!response.ok) {
      return {
        size: null,
        status: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const contentLength = response.headers.get('content-length')
    if (!contentLength) {
      return {
        size: null,
        status: response.status,
        error: 'Missing content-length header',
      }
    }

    const size = parseInt(contentLength, 10)
    if (Number.isNaN(size)) {
      return {
        size: null,
        status: response.status,
        error: 'Invalid content-length value',
      }
    }

    return { size, status: response.status }
  } catch (error) {
    return {
      size: null,
      status: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

export const updateToSourceVersion = async (update: Update) => {
  for (const url of update.downloadUrlAlternatives) {
    const result = await getFileSizeFromHEAD(url)
    if (result.size === null) continue
    return {
      version: update.version,
      date: timestampToISO(update.publishTime),
      localizedDescription: update.description,
      downloadURL: url,
      size: result.size,
      buildVersion: DEFAULT_BUILD_VERSION,
      minOSVersion: DEFAULT_MIN_OS_VERSION,
    } as SourceVersion
  }

  console.warn(`[warn] ${update.version} 无可用的下载链接。`)
  return null
}

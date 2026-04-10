import type { SourceVersion, Update } from './types'

interface FileSizeResult {
  size: number | null
  status: number
  error?: string
}

// Extract from plist
const DEFAULT_MIN_OS_VERSION = '14.0'

const getBuildVersionFromGradleProperties = async (version: string): Promise<string> => {
  const tag = version.startsWith('v') ? version : `v${version}`
  const gradlePropertiesUrl = `https://raw.githubusercontent.com/open-ani/animeko/refs/tags/${tag}/gradle.properties`

  try {
    const response = await fetch(gradlePropertiesUrl)
    if (!response.ok) {
      throw new Error(`获取 ${tag} 的 gradle.properties 失败: HTTP ${response.status}`)
    }

    const content = await response.text()
    const iosMatch = content.match(/^\s*ios\.version\.code\s*=\s*(\d+)\s*$/m)
    if (iosMatch?.[1]) return iosMatch[1]

    const androidMatch = content.match(/^\s*android\.version\.code\s*=\s*(\d+)\s*$/m)
    if (androidMatch?.[1]) return androidMatch[1]

    throw new Error(
      `未在 ${tag} 的 gradle.properties 中找到 ios.version.code 或 android.version.code`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    throw new Error(`读取 ${tag} 的 gradle.properties 出错: ${message}`)
  }
}

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
    const normalizedURL = url.startsWith('https://ghfast.top/')
      ? url.replace('https://ghfast.top/', '')
      : url
    const result = await getFileSizeFromHEAD(normalizedURL)
    if (result.size === null) continue
    const buildVersion = await getBuildVersionFromGradleProperties(update.version)
    return {
      version: update.version,
      date: timestampToISO(update.publishTime),
      localizedDescription: update.description,
      downloadURL: normalizedURL,
      size: result.size,
      buildVersion,
      minOSVersion: DEFAULT_MIN_OS_VERSION,
    } as SourceVersion
  }

  console.warn(`[warn] ${update.version} 无可用的下载链接。`)
  return null
}

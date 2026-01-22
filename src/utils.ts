import type { SourceVersion, Update } from './types'

export const timestampToISO = (timestamp: number) => new Date(timestamp * 1000).toISOString()

export const getFileSizeFromHEAD = async (url: string): Promise<number | null> => {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    if (!response.ok) return null

    const contentLength = response.headers.get('content-length')
    if (!contentLength) return null

    const size = parseInt(contentLength, 10)
    return Number.isNaN(size) ? null : size
  } catch {
    return null
  }
}

export const updateToSourceVersion = async (update: Update): Promise<SourceVersion> => {
  const downloadURL = update.downloadUrlAlternatives[0]
  const size = await getFileSizeFromHEAD(downloadURL)

  return {
    version: update.version,
    date: timestampToISO(update.publishTime),
    localizedDescription: update.description,
    downloadURL,
    size: size ?? undefined,
    // Fixed build version:
    // https://github.com/open-ani/animeko/blob/fd3991935017e8513c9c795c8deb280599ec0685/app/ios/build.gradle.kts#L272
    // https://github.com/open-ani/animeko/blob/fd3991935017e8513c9c795c8deb280599ec0685/gradle.properties#L21
    buildVersion: '30200',
    // Extract from plist
    minOSVersion: '14.0',
  }
}

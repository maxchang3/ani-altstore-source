import { type IpaMetadata, normalizeDownloadURL, probeIpa } from './ipa'
import { APP_BUNDLE_IDENTIFIER, isBetaTag } from './releases'
import type { SourceVersion, Update } from './types'

export type IpaResolver = (url: string) => Promise<IpaMetadata>

export const timestampToISO = (timestamp: number) => new Date(timestamp * 1000).toISOString()

export const updateToSourceVersion = async (
  update: Update,
  resolveIpa: IpaResolver = probeIpa,
  preferredURL?: string
): Promise<SourceVersion | null> => {
  // Reuse the last successful URL when still offered by upstream; otherwise keep API order.
  const urls = [...new Set(update.downloadUrlAlternatives.map(normalizeDownloadURL))]
  if (preferredURL && urls.includes(preferredURL)) {
    urls.splice(urls.indexOf(preferredURL), 1)
    urls.unshift(preferredURL)
  }
  for (const normalizedURL of urls) {
    try {
      const metadata = await resolveIpa(normalizedURL)
      if (metadata.bundleIdentifier !== APP_BUNDLE_IDENTIFIER) {
        throw new Error(`包内 Bundle ID 不符: ${metadata.bundleIdentifier}`)
      }
      return {
        releaseTag: update.version,
        version: metadata.version,
        buildVersion: metadata.buildVersion,
        minOSVersion: metadata.minOSVersion,
        date: timestampToISO(update.publishTime),
        localizedDescription: isBetaTag(update.version)
          ? `🧪 预发布 ${update.version}\n\n${update.description}`
          : update.description,
        downloadURL: normalizedURL,
        size: metadata.size,
      }
    } catch (error) {
      console.warn(
        `[warn] ${update.version} 探测失败 (${normalizedURL}): ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return null
}

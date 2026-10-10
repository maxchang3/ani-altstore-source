import { coerce, gte } from 'semver'

export const APP_BUNDLE_IDENTIFIER = 'org.animeko.animeko'
export const LEGACY_APP_BUNDLE_IDENTIFIER = 'org.openani.Animeko'
export type ReleaseChannel = 'stable' | 'beta'
export type SourceSeries = 'current' | 'legacy'

export const isBetaTag = (tag: string): boolean =>
  /(?:^|[-.])(alpha|beta|rc|nightly|preview)(?:[.\d-]|$)/i.test(tag)

export const meetsMinimumVersion = (tag: string): boolean => {
  const version = coerce(tag)
  return version !== null && gte(version, '5.4.0')
}

export const isLegacyVersion = (tag: string): boolean => {
  const version = coerce(tag)
  return version !== null && !gte(version, '5.4.0')
}

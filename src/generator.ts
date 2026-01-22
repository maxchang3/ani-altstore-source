import { fetchUpdates } from './api'
import type { App, Source, SourceVersion } from './types'
import { updateToSourceVersion } from './utils'

const isBetaVersion = (version: string) => version.includes('alpha') || version.includes('beta')

const appTemplate = (baseName: string): Omit<App, 'versions'> => ({
  name: baseName,
  bundleIdentifier: 'org.openani.Animeko',
  marketplaceID: '',
  developerName: 'open-ani',
  subtitle: 'An awesome app.',
  localizedDescription:
    '集找番、追番、看番的一站式弹幕追番平台，云收藏同步 (Bangumi)，离线缓存，BitTorrent，弹幕云过滤。',
  iconURL: 'https://i.imgur.com/qzd5WdZ.png',
  tintColor: '#6c9cc4',
  category: 'entertainment',
  screenshots: {
    iphone: [
      'https://github.com/open-ani/animeko/blob/main/.readme/images/features/home.png?raw=true',
      'https://github.com/open-ani/animeko/blob/main/.readme/images/features/anime-schedule.png?raw=true',
      'https://github.com/open-ani/animeko/blob/main/.readme/images/features/subject-collection.png?raw=true',
      'https://github.comopen-ani/animeko/blob/main/.readme/images/features/search-by-tag.png?raw=true',
      'https://github.com/open-ani/animeko/blob/main/.readme/images/features/subject-details.png?raw=true',
      'https://github.com/open-ani/animeko/blob/main/.readme/images/features/subject-rating.png?raw=true',
    ],
    ipad: [
      {
        imageURL: 'https://github.com/open-ani/animeko/raw/main/.readme/images/features/pc-home.png?raw=true',
        width: 2966,
        height: 1576,
      },
      {
        imageURL: 'https://github.com/open-ani/animeko/raw/main/.readme/images/features/pc-search.png?raw=true',
        width: 2722,
        height: 1742,
      },
      {
        imageURL: 'https://github.com/open-ani/animeko/raw/main/.readme/images/features/pc-search-detail.png?raw=true',
        width: 2528,
        height: 1742,
      },
    ],
  },
  appPermissions: {
    entitlements: [],
    privacy: {},
  },
  patreon: {},
})

export const generateSource = async (): Promise<Source> => {
  const updates = await fetchUpdates()

  const allVersions = await Promise.all(updates.updates.map(updateToSourceVersion))

  const stableVersions: SourceVersion[] = []
  const betaVersions: SourceVersion[] = []

  for (const version of allVersions) {
    if (isBetaVersion(version.version)) {
      betaVersions.push(version)
    } else {
      stableVersions.push(version)
    }
  }

  const stableApp: App = {
    ...appTemplate('Animeko'),
    versions: stableVersions,
  }

  const betaApp: App = {
    ...appTemplate('Animeko (Pre-Release)'),
    versions: betaVersions,
    bundleIdentifier: 'org.openani.Animeko.beta',
  }

  const source: Source = {
    name: 'open-ani',
    subtitle: '',
    description: '',
    iconURL: 'https://i.imgur.com/qzd5WdZ.png',
    website: 'https://myani.org',
    tintColor: '#6156e2',
    featuredApps: [stableApp.bundleIdentifier],
    apps: [stableApp, betaApp],
    news: [],
  }

  return source
}

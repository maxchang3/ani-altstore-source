import { Listr } from 'listr2'
import { coerce, gte } from 'semver'
import { fetchUpdates } from './api'
import type { App, Source, SourceVersion } from './types'
import { updateToSourceVersion } from './utils'

const isBetaVersion = (version: string) => version.includes('alpha') || version.includes('beta')

// 比较版本号是否满足最小版本要求 (>= 5.4.x)
const meetsMinimumVersion = (version: string, minimumVersion: string = '5.4.0'): boolean => {
  const parsedVersion = coerce(version)
  return parsedVersion ? gte(parsedVersion, minimumVersion) : false
}

const appTemplate = (baseName: string): Omit<App, 'versions'> => ({
  name: baseName,
  bundleIdentifier: 'org.animeko.animeko',
  developerName: 'openani',
  localizedDescription:
    '集找番、追番、看番的一站式弹幕追番平台，云收藏同步 (Bangumi)，离线缓存，BitTorrent，弹幕云过滤。',
  iconURL: 'https://avatars.githubusercontent.com/u/166622089',
  tintColor: '#6c9cc4',
  category: 'entertainment',
  screenshots: {
    iphone: [
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/home.png',
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/anime-schedule.png',
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/subject-collection.png',
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/search-by-tag.png',
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/subject-details.png',
      'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/subject-rating.png',
    ],
    ipad: [
      {
        imageURL:
          'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/pc-home.png',
        width: 2966,
        height: 1576,
      },
      {
        imageURL:
          'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/pc-search.png',
        width: 2722,
        height: 1742,
      },
      {
        imageURL:
          'https://raw.githubusercontent.com/open-ani/animeko/main/.readme/images/features/pc-search-detail.png',
        width: 2528,
        height: 1742,
      },
    ],
  },
  appPermissions: {
    entitlements: [],
    privacy: {},
  },
})

export const generateSource = async (): Promise<Source> => {
  const { updates } = await fetchUpdates()

  // 筛选出满足最小版本要求的版本 (>= 5.4.x)
  const orderedUpdates = updates
    .filter((update) => meetsMinimumVersion(update.version))
    .toReversed()
  const allVersionResults: Array<SourceVersion | null> = new Array(orderedUpdates.length).fill(null)

  const tasks = new Listr(
    orderedUpdates.map((update, index) => ({
      title: `处理 ${update.version}`,
      task: async () => {
        const sourceVersion = await updateToSourceVersion(update)

        allVersionResults[index] = sourceVersion
      },
    })),
    {
      concurrent: 6,
      exitOnError: false,
    }
  )

  await tasks.run()

  const allVersions = allVersionResults.filter(
    (version): version is SourceVersion => version !== null
  )

  if (allVersionResults.length !== allVersions.length) {
    const filteredCount = allVersionResults.length - allVersions.length
    console.warn(`[warn] 过滤掉了 ${filteredCount} 个无法下载的版本`)
  }

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
    bundleIdentifier: 'org.animeko.animeko.beta',
  }

  const source: Source = {
    name: 'OpenAni',
    iconURL: 'https://avatars.githubusercontent.com/u/166622089',
    website: 'https://myani.org',
    tintColor: '#6156e2',
    featuredApps: [stableApp.bundleIdentifier],
    apps: [stableApp, betaApp],
    news: [],
  }

  return source
}

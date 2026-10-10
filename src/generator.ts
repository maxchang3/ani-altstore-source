import { Listr } from 'listr2'
import { fetchUpdates } from './api'
import {
  APP_BUNDLE_IDENTIFIER,
  isBetaTag,
  meetsMinimumVersion,
  type ReleaseChannel,
} from './releases'
import type { App, Source, SourceVersion, Update } from './types'
import { type IpaResolver, updateToSourceVersion } from './utils'
import { assertSource, assertUpdates } from './validation'

const appTemplate = (baseName: string): Omit<App, 'versions'> => ({
  name: baseName,
  bundleIdentifier: APP_BUNDLE_IDENTIFIER,
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

export interface GeneratedSources {
  stable: Source
  beta: Source
}

interface GenerateOptions {
  updates?: Update[]
  previous?: Partial<GeneratedSources>
  resolveIpa?: IpaResolver
}

const makeSource = (channel: ReleaseChannel, versions: SourceVersion[]): Source => ({
  name: channel === 'beta' ? 'OpenAni (Pre-Release)' : 'OpenAni',
  iconURL: 'https://avatars.githubusercontent.com/u/166622089',
  website: 'https://myani.org',
  tintColor: '#6156e2',
  featuredApps: [APP_BUNDLE_IDENTIFIER],
  apps: [
    {
      ...appTemplate(channel === 'beta' ? 'Animeko (Pre-Release)' : 'Animeko'),
      ...(channel === 'beta' ? { beta: true } : {}),
      versions,
    },
  ],
  news: [],
})

export const generateSources = async (options: GenerateOptions = {}): Promise<GeneratedSources> => {
  const updates = options.updates ?? (await fetchUpdates()).updates
  assertUpdates({ updates })
  const orderedUpdates = updates
    .filter((update) => meetsMinimumVersion(update.version))
    .sort((a, b) => b.publishTime - a.publishTime)
  if (orderedUpdates.length === 0) throw new Error('更新 API 没有符合最低版本要求的记录')

  const records: Record<ReleaseChannel, Map<string, SourceVersion>> = {
    stable: new Map(),
    beta: new Map(),
  }
  for (const channel of ['stable', 'beta'] as const) {
    const previous = options.previous?.[channel]
    if (!previous) continue
    assertSource(previous, channel)
    // Keep known records even when an incremental API stops including older releases.
    for (const version of previous.apps[0].versions)
      records[channel].set(version.releaseTag, version)
  }

  const tasks = new Listr(
    orderedUpdates.map((update) => ({
      title: `处理 ${update.version}`,
      task: async () => {
        // Classify BEFORE converting the tag into CFBundleShortVersionString.
        const channel = isBetaTag(update.version) ? 'beta' : 'stable'
        const version = await updateToSourceVersion(
          update,
          options.resolveIpa,
          records[channel].get(update.version)?.downloadURL
        )
        if (version) {
          records[channel].set(update.version, version)
        } else {
          const action = records[channel].has(update.version)
            ? '保留上轮已验证的数据'
            : '暂不发布，等待下轮重试'
          console.warn(`[warn] ${update.version} 无法探测：${action}`)
        }
      },
    })),
    { concurrent: 6, exitOnError: true }
  )
  await tasks.run()

  const versionsFor = (channel: ReleaseChannel): SourceVersion[] => {
    const seen = new Set<string>()
    return [...records[channel].values()]
      .sort(
        (a, b) =>
          Date.parse(b.date) - Date.parse(a.date) || a.releaseTag.localeCompare(b.releaseTag)
      )
      .filter((version) => {
        const key = `${version.version}|${version.buildVersion}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }
  const sources = {
    stable: makeSource('stable', versionsFor('stable')),
    beta: makeSource('beta', versionsFor('beta')),
  }
  assertSource(sources.stable, 'stable')
  assertSource(sources.beta, 'beta')
  return sources
}

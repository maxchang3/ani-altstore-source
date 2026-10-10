import { IpaMetadataCache } from './cache'
import { generateSources } from './generator'
import { readPreviousSources, SOURCE_FILES, writeSources } from './output'

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--reprobe')) throw new Error('仅支持 --reprobe 参数')

console.log('正在生成 Animeko 稳定版与预发布源...')
const cache = new IpaMetadataCache({ reprobe: args.includes('--reprobe') })
await cache.load()
const previous = await readPreviousSources()
const sources = await generateSources({ previous, resolveIpa: (url) => cache.probe(url) })
await cache.save()
await writeSources(sources)

for (const channel of ['stable', 'beta'] as const) {
  const versions = sources[channel].apps[0].versions
  console.log(
    `已生成 generated/${SOURCE_FILES[channel]}：${versions.length} 个版本；最新 ${versions[0].releaseTag} (${versions[0].buildVersion})`
  )
}

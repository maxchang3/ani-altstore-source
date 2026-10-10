import { LEGACY_SOURCE_FILES, SOURCE_FILES } from './output'
import { assertSource } from './validation'

for (const series of ['current', 'legacy'] as const) {
  const files = series === 'legacy' ? LEGACY_SOURCE_FILES : SOURCE_FILES
  for (const channel of ['stable', 'beta'] as const) {
    const path = `generated/${files[channel]}`
    const source: unknown = await Bun.file(path).json()
    assertSource(source, channel, series)
    console.log(`校验通过: ${path} (${source.apps[0].versions.length} 个版本)`)
  }
}

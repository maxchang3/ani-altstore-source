import {
  APP_BUNDLE_IDENTIFIER,
  isBetaTag,
  isLegacyVersion,
  LEGACY_APP_BUNDLE_IDENTIFIER,
  meetsMinimumVersion,
  type ReleaseChannel,
  type SourceSeries,
} from './releases'
import type { Source, Updates } from './types'

function fail(message: string): never {
  throw new Error(`源校验失败: ${message}`)
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} 必须是对象`)
}

function nonempty(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label} 必须是非空字符串`)
}

const httpURL = (value: unknown, label: string): void => {
  nonempty(value, label)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail(`${label} 不是有效 URL`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) fail(`${label} 必须使用 HTTP(S)`)
}

export function assertUpdates(value: unknown): asserts value is Updates {
  record(value, '更新 API 响应')
  if (!Array.isArray(value.updates) || value.updates.length === 0) fail('更新 API 返回空列表')
  const tags = new Set<string>()
  for (const update of value.updates) {
    record(update, '更新记录')
    nonempty(update.version, '发布标签')
    if (tags.has(update.version)) fail(`重复发布标签 ${update.version}`)
    tags.add(update.version)
    if (
      typeof update.publishTime !== 'number' ||
      !Number.isFinite(update.publishTime) ||
      !Number.isFinite(new Date(update.publishTime * 1000).getTime())
    )
      fail('发布时间无效')
    if (typeof update.description !== 'string') fail('更新说明无效')
    if (!Array.isArray(update.downloadUrlAlternatives)) fail('下载链接列表无效')
    for (const url of update.downloadUrlAlternatives) httpURL(url, '下载链接')
  }
}

export function assertSource(
  value: unknown,
  channel: ReleaseChannel,
  series: SourceSeries = 'current'
): asserts value is Source {
  const bundleIdentifier =
    series === 'legacy' ? LEGACY_APP_BUNDLE_IDENTIFIER : APP_BUNDLE_IDENTIFIER
  record(value, '源')
  nonempty(value.name, '源名称')
  if (!Array.isArray(value.apps) || value.apps.length !== 1) fail('每个源必须包含一个应用')
  if (!Array.isArray(value.news)) fail('news 必须是数组')
  const app = value.apps[0]
  record(app, '应用')
  if (app.bundleIdentifier !== bundleIdentifier) fail('应用 Bundle ID 必须使用 IPA 真实值')
  for (const field of ['name', 'developerName', 'localizedDescription']) nonempty(app[field], field)
  httpURL(app.iconURL, '应用图标')
  record(app.appPermissions, '应用权限')
  if (!Array.isArray(app.appPermissions.entitlements)) fail('entitlements 必须是数组')
  record(app.appPermissions.privacy, '隐私权限')
  if (channel === 'beta' ? app.beta !== true : app.beta === true) fail('测试版标记与源不符')
  if (!Array.isArray(app.versions) || app.versions.length === 0) fail(`${channel} 版本列表不能为空`)
  const tags = new Set<string>()
  const builds = new Set<string>()
  let previousDate = Number.POSITIVE_INFINITY
  for (const version of app.versions) {
    record(version, '版本')
    for (const field of ['releaseTag', 'version', 'buildVersion', 'minOSVersion', 'date'])
      nonempty(version[field], field)
    const tag = version.releaseTag as string
    const matchesSeries = series === 'legacy' ? isLegacyVersion(tag) : meetsMinimumVersion(tag)
    if (!matchesSeries || isBetaTag(tag) !== (channel === 'beta')) fail(`发布标签 ${tag} 分类错误`)
    if (tags.has(tag)) fail(`重复发布标签 ${tag}`)
    tags.add(tag)
    const buildKey = `${version.version}|${version.buildVersion}`
    if (builds.has(buildKey)) fail(`重复版本与 build ${buildKey}`)
    builds.add(buildKey)
    for (const field of ['version', 'minOSVersion']) {
      if (!/^\d+(?:\.\d+){0,2}$/.test(version[field] as string)) fail(`${field} 格式无效`)
    }
    const date = Date.parse(version.date as string)
    if (!Number.isFinite(date) || date > previousDate) fail('版本必须按有效发布时间倒序排列')
    previousDate = date
    if (!Number.isSafeInteger(version.size) || (version.size as number) <= 0) fail('IPA 大小无效')
    httpURL(version.downloadURL, '版本下载链接')
    if (typeof version.localizedDescription !== 'string') fail('版本更新说明无效')
  }
  if (!Array.isArray(value.featuredApps) || !value.featuredApps.includes(bundleIdentifier))
    fail('featuredApps 无效')
}

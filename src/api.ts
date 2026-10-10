import { assertUpdates } from './validation'

export const fetchUpdates = async () => {
  const url =
    'https://danmaku-cn.myani.org/v1/updates/incremental/details?clientVersion=4.0.0&clientPlatform=ios&clientArch=aarch64&releaseClass=alpha'

  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    throw new Error(`Failed to fetch updates: ${response.status} ${response.statusText}`)
  }

  const data: unknown = await response.json()
  assertUpdates(data)
  return data
}

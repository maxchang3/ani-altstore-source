import type { Updates } from './types'

export const fetchUpdates = async () => {
  const url =
    'https://danmaku-cn.myani.org/v1/updates/incremental/details?clientVersion=4.0.0&clientPlatform=ios&clientArch=aarch64&releaseClass=alpha'

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch updates: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<Updates>
}

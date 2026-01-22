export interface Update {
  version: string
  downloadUrlAlternatives: string[]
  publishTime: number
  description: string
}

export interface Updates {
  updates: Update[]
}

export interface Source {
  name: string
  subtitle?: string
  description?: string
  iconURL?: string
  headerURL?: string
  website?: string
  patreonURL?: string
  tintColor?: string
  featuredApps?: string[]
  apps: App[]
  news: News[]
}

export interface SourceVersion {
  version: string
  buildVersion: string
  date: string
  size: number
  downloadURL: string
  localizedDescription: string
  minOSVersion?: string
  maxOSVersion?: string
}

export interface App {
  name: string
  bundleIdentifier: string
  marketplaceID?: string
  developerName: string
  subtitle?: string
  localizedDescription: string
  iconURL: string
  tintColor: string
  category?:
    | 'developer'
    | 'entertainment'
    | 'games'
    | 'lifestyle'
    | 'other'
    | 'photo-video'
    | 'social'
    | 'utilities'
  screenshots: Array<imageWithSize | string> | ScreenshotsClass
  versions: SourceVersion[]
  appPermissions: {
    entitlements: string[]
    privacy: Record<string, string>
  }
  patreon: {
    pledge?: number
    currency?: string
    benefit?: string
    tiers?: string[]
  }
}

interface imageWithSize {
  imageURL: string
  width: number
  height: number
}

interface ScreenshotsClass {
  iphone: Array<imageWithSize | string>
  ipad: imageWithSize[]
}

interface News {
  title: string
  identifier: string
  caption: string
  date: string
  tintColor: string
  imageURL: string
  notify: boolean
  url?: string
  appID?: string
}

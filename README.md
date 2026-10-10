# Animeko AltStore Source

[English](#english)

[Animeko](https://myani.org) 的 AltStore 源。支持 AltStore Classic、[SideStore](https://sidestore.io/) 和 [LiveContainer](https://github.com/LiveContainer/LiveContainer) 等使用 AltStore 源格式的客户端。安装步骤见 [Animeko iOS 安装指南](https://animeko.org/wiki/ios-install) 的「方法二 → 方式 B」。

## 添加源<sup>*</sup>

[![在线预览稳定版源](https://img.shields.io/badge/在线预览-稳定版源-brightgreen)](https://therealfoxster.github.io/altsource-viewer/view/?source=https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps.json)
[![在线预览预发布版源](https://img.shields.io/badge/在线预览-预发布版源-brightgreen)](https://therealfoxster.github.io/altsource-viewer/view/?source=https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-beta.json)
[![Powered by altsource-viewer](https://img.shields.io/badge/Powered_by-altsource--viewer-blue)](https://github.com/therealFoxster/altsource-viewer)

按需选择一个源，将 URL 导入客户端。

**稳定版**（`apps.json`）：

```text
https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps.json
```

**预发布版**（Alpha / Beta / RC / Nightly / Preview，`apps-beta.json`）：

```text
https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-beta.json
```

由于使用相同的 `bundleIdentifier`，切换版本会替换现有安装，不能作为两个应用并存。

GitHub 直链无法访问时，可尝试 jsDelivr 备用地址：[稳定版](https://cdn.jsdelivr.net/gh/maxchang3/ani-altstore-source@main/generated/apps.json) / [预发布版](https://cdn.jsdelivr.net/gh/maxchang3/ani-altstore-source@main/generated/apps-beta.json)。分支 URL 通常缓存 12 小时，更新可能延迟；不同网络下的访问速度有差异。

<sup>* 以上源提供 5.4.0 及以上版本。需要低于 5.4.0 的版本时，请选择 [旧版稳定源（apps-old.json）](https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-old.json) 或 [旧版预发布源（apps-old-beta.json）](https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-old-beta.json)。</sup>

## 客户端行为

在上述三个客户端中，目前只有 SideStore 支持 `releaseChannels`，因此本项目将稳定版与预发布版分为独立源。

| 客户端 | 默认版本选择 |
| --- | --- |
| AltStore Classic | 所选源中最新的系统兼容版本 |
| SideStore | 所选源中最新的系统兼容版本；预发布源无需开启 Beta Updates |
| LiveContainer | 所选源中最新的有效版本；预发布源显示 Beta 角标 |

---

## English

An AltStore source for [Animeko](https://myani.org). Supports AltStore Classic, [SideStore](https://sidestore.io/), [LiveContainer](https://github.com/LiveContainer/LiveContainer) and other clients using the AltStore source format. For installation steps, see [Animeko's iOS installation guide](https://animeko.org/wiki/ios-install) (Chinese), “Method 2 → Method B”.

### Add a source<sup>*</sup>

[![Preview the stable source](https://img.shields.io/badge/Preview-Stable_source-brightgreen)](https://therealfoxster.github.io/altsource-viewer/view/?source=https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps.json)
[![Preview the prerelease source](https://img.shields.io/badge/Preview-Prerelease_source-brightgreen)](https://therealfoxster.github.io/altsource-viewer/view/?source=https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-beta.json)
[![Powered by altsource-viewer](https://img.shields.io/badge/Powered_by-altsource--viewer-blue)](https://github.com/therealFoxster/altsource-viewer)

Choose a source and import its URL into your client.

**Stable** (`apps.json`):

```text
https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps.json
```

**Prerelease** (Alpha / Beta / RC / Nightly / Preview, `apps-beta.json`):

```text
https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-beta.json
```

Both builds use the same `bundleIdentifier`. Switching versions replaces the existing installation; they cannot coexist as separate apps.

If GitHub URLs are inaccessible, try the jsDelivr mirrors: [stable](https://cdn.jsdelivr.net/gh/maxchang3/ani-altstore-source@main/generated/apps.json) / [prerelease](https://cdn.jsdelivr.net/gh/maxchang3/ani-altstore-source@main/generated/apps-beta.json). Branch URLs are normally cached for 12 hours, so updates may lag. Access speeds vary by network.

<sup>* The sources above provide versions 5.4.0 and later. For versions below 5.4.0, choose the [legacy stable source (apps-old.json)](https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-old.json) or the [legacy prerelease source (apps-old-beta.json)](https://raw.githubusercontent.com/maxchang3/ani-altstore-source/main/generated/apps-old-beta.json).</sup>

### Client behavior

Of the three clients listed above, only SideStore currently supports `releaseChannels`, so this project provides separate stable and prerelease sources.

| Client | Default version selection |
| --- | --- |
| AltStore Classic | Latest system-compatible version in the chosen source |
| SideStore | Latest system-compatible version in the chosen source; Beta Updates is not required for the prerelease source |
| LiveContainer | Latest valid version in the chosen source; the prerelease source displays a Beta badge |

## License

[MIT](./LICENSE) License © [maxchang3](https://github.com/maxchang3)

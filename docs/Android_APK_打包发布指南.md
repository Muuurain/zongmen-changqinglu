# Android APK 打包与发布指南

本文说明如何在 Windows 上从当前仓库构建、签名、安装和验证 Android APK。项目基于 Capacitor 将现有 HTML/CSS/JavaScript 游戏包装为 Android 应用；游戏页面仍来自 `index.html`、`css/`、`js/` 和 `assets/`。

## 当前配置

| 项目 | 配置 |
| --- | --- |
| 应用 ID | `com.zongmen.changqinglu` |
| 版本 | `1.2.3`（`versionCode=10203`） |
| Android 最低版本 | Android 7.0 / API 24 |
| 编译及目标 API | API 36 |
| Java | JDK 21 |
| Android Gradle Plugin / Gradle | 8.13.0 / 8.14.3 |
| Android Build Tools | 36.0.0 |
| Android 桥接 | Capacitor 8.5.3、App 8.1.2、Filesystem 8.1.5 |
| 发布 APK 输出 | `release-android/宗门长青录-v1.2.3-android-release.apk` |

版本号在 `package.json` 与 `android/app/build.gradle` 中同步维护。建议 `versionCode` 沿用 `主版本×10000 + 次版本×100 + 修订号`，并保证每次发布都大于商店及设备上已有的版本。

## 首次环境准备

1. 安装 Node.js 22 LTS（包含 npm）、JDK 21 和 Android SDK Command-line Tools。Android Studio 可选；无需打开 IDE 才能执行下述命令。
2. 在 Android SDK Manager 安装 `platform-tools`、`platforms;android-36` 与 `build-tools;36.0.0`，并接受 Android SDK licenses。
3. 配置当前终端环境变量。以下是本项目所用的示例路径，请按机器实际安装位置修改。APK 构建脚本会按该 SDK 路径自动写入 Git 忽略的 `android/local.properties`：

   ```powershell
   $env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
   $env:ANDROID_SDK_ROOT = 'D:\Android\Sdk'
   $env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_SDK_ROOT\platform-tools;$env:Path"
   ```

   `ANDROID_HOME` 可同时设置为同一个 SDK 目录，以兼容旧工具。Gradle wrapper 会自行下载项目指定的 Gradle 版本；首次构建需联网下载 Gradle 与 Android Maven 依赖。
4. 在项目根目录执行 `npm ci` 安装锁定依赖。不要手工改 `package-lock.json` 中的 Capacitor 版本。

项目路径可包含中文；Android 工程已在 `android/gradle.properties` 中启用 AGP 的 `android.overridePathCheck=true` 路径检查覆盖项，这是 Windows 中文目录下构建所需的设置。不要删除该项。

## 常用构建和安装命令

在仓库根目录运行：

```powershell
npm test                         # 运行现有游戏逻辑测试
npm run build:web                # 复制网页资源并构建 Android 原生桥接
npm run android:sync             # 生成网页资源并同步到 android/
npm run android:apk              # 构建可安装的 debug APK
npm run android:release-apk      # 构建已签名的 release APK
npm run android:install          # 构建并安装 debug APK 到已连接的设备/模拟器
npm run android:open              # 在 Android Studio 中打开原生工程（可选）
```

`android:apk` / `android:release-apk` 会先执行网页构建，再运行 `cap sync android` 与 Gradle，并把 APK 复制到 `release-android/`。`www/`、`android/app/build/` 和 Gradle 中间产物由 Git 忽略；请不要手工编辑生成的 `android/app/src/main/assets/public/`，更改应放回网页源码后重新同步。

直接在设备上安装 release APK 的例子：

```powershell
adb install -r .\release-android\宗门长青录-v1.2.3-android-release.apk
```

手机需打开开发者选项和 USB 调试，或使用已启动的 Android 模拟器。普通用户也可将该单体 APK 复制到设备并允许“安装未知应用”。

## 发布签名

Debug APK 使用 Gradle 自动生成的调试证书，只用于本地测试。正式发布必须使用持续保管的同一份私钥，否则无法覆盖安装到用户设备上的旧版本。

首次发布时，在仓库之外创建 PKCS12 密钥库，并将密钥库和密码存入密码管理器及离线备份。PowerShell 示例（交互式输入强密码，不要将密码写进命令历史）：

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore D:\Android\zongmen-release.p12 `
  -alias zongmen-release -keyalg RSA -keysize 3072 -validity 10000
```

在 `android/keystore.properties`（已加入 `.gitignore`）写入本机密钥信息，文件格式如下：

```properties
storeFile=D:/Android/zongmen-release.p12
storePassword=替换为密钥库密码
keyAlias=zongmen-release
keyPassword=替换为私钥密码
```

密钥库路径可写绝对路径或相对 `android/` 的路径。不要把真实密码、密钥库、签名属性文件提交到 GitHub，也不要在聊天、日志或截图中公开它们。首次生成密钥后应将密钥库和密码备份至两个受控位置；丢失密钥会阻止旧用户原位升级。当前执行环境的签名密钥位于仓库外的 `D:\Android\zongmen-release.p12`，属性文件只存在于本机忽略文件中。

设置好签名后构建并验证：

```powershell
npm run android:release-apk
& "$env:ANDROID_SDK_ROOT\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs `
  .\release-android\宗门长青录-v1.2.3-android-release.apk
```

校验输出应显示签名 scheme 验证通过，并显示预期证书。另可检查包信息：

```powershell
& "$env:ANDROID_SDK_ROOT\build-tools\36.0.0\aapt.exe" dump badging `
  .\release-android\宗门长青录-v1.2.3-android-release.apk
```

重点核对 `package: name='com.zongmen.changqinglu'`、版本名 `1.2.3` 与版本码 `10203`。**发布前**须按本次版本更新规则提升 `package.json` 版本、`android/app/build.gradle` 的 `versionName` 与 `versionCode`；产物文件名由脚本自动读取 `package.json`。请先备份旧 APK，避免新构建覆盖旧产物。

## 安卓适配行为

- 页面通过 viewport、安全区 inset 与窄屏 CSS 支持手机竖屏和横屏；活动未锁定方向，Android 配置变化由 Capacitor Activity 接收，页面重新布局。资源栏、操作栏、底部导航和宽表格分别横向滚动，弹窗使用可滚动视口，主要按钮有触屏尺寸。
- 音乐在用户首次触摸后启动；系统将应用切到后台时暂停音乐，回到前台后尝试恢复此前播放状态。浏览器/WebView 的自动播放策略仍适用，静音设备或关闭音乐时不会强制播放。
- 原有浏览器存档使用 localStorage。Android 首次打开时将槽位 0–3 迁移到应用私有 Filesystem `Directory.Data`，之后以 `save_0.json` 至 `save_3.json` 为持久存档，并保留 localStorage 内存镜像供同步游戏逻辑读取。后台时保存自动档并 flush 未完成写入；卸载或清除应用数据会删除本地存档，APK 不含云同步。
- 系统返回键会按游戏状态关闭普通弹窗、返回上级页面、保存并返回开始页，或经确认后退出；待处理事件会要求确认后再离开。返回开始页和退出前会等待本地待写存档 flush 完成，前后台切换由 Capacitor App 插件通知页面。

## 常见问题

| 现象 | 处理方式 |
| --- | --- |
| `Android SDK not found` | 设置 `ANDROID_SDK_ROOT` 为 Android SDK 根目录，并确认其中有 `platforms/android-36` 与 `build-tools/36.0.0`。 |
| Gradle 报 Java 版本不兼容 | 确认 `java -version` 是 JDK 21；在运行构建的同一个 PowerShell 窗口设置 `JAVA_HOME`。 |
| SDK license 未接受 / 缺少平台组件 | 使用 SDK Manager 接受 licenses 并安装本指南列出的 API 36 与 build-tools。 |
| Gradle 从 Google Maven / Maven Central 报 TLS handshake / Remote host terminated | 先重试一次，并确认 JDK 21 可访问依赖仓库。受限网络可临时启用随仓库提供的镜像替换脚本：`$env:ANDROID_GRADLE_INIT_SCRIPT = 'scripts/android-maven-mirror.init.gradle'`，再运行 release 命令；该变量只影响当前 PowerShell 窗口，正常网络不需要启用。 |
| WebView 白屏或页面缺少新代码 | 先执行 `npm run build:web` 和 `npx cap sync android`；源码只改在 `index.html`、`css/`、`js/`、`assets/`。确认 `www/` 已生成。 |
| `keystore.properties` missing 或 release signing 报错 | 首次发布时按上文创建外部 keystore 和本地属性文件；属性文件不是仓库交付内容。检查路径、别名、密码。 |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 设备上已安装的同包名应用使用不同签名。正式升级需使用原发布密钥；卸载重装会清除该应用本地存档。 |
| 安装后音乐没有自动播放 | 先触摸界面；检查系统媒体音量和游戏内音乐按钮。Android/WebView 对无手势自动播放有限制。 |
| 找不到旧存档 | 首次迁移依赖旧 WebView localStorage；不要清除应用数据或先卸载旧版。存档是应用私有文件，当前没有导出/云同步功能。 |

## 发布前验收

1. `npm test` 全部通过；网页和 Android 同步构建成功。
2. 用 `apksigner verify` 检查 release 签名；用 `aapt dump badging` 核对包名、版本名、版本码。
3. 在至少一个竖屏手机/模拟器上安装并启动；进入新周目、推进一个月、执行存档、强制结束并重启后读取自动档。
4. 在至少一个横屏尺寸检查主界面、导航、宽表格与长弹窗的滚动和触控；测试返回键、切后台/恢复、首次音乐交互。
5. 记录实际设备/模拟器 API、签名证书摘要、安装与存档测试结果后，再交付 APK。

# JMComic

用于 Scripting 的私人漫画阅读脚本。当前版本 **4.1.0**。

## 远程导入

在 Scripting 的远程脚本导入中填写：

https://github.com/Guanqi-Li/JMComic/tree/main/JMComic

此地址直接读取 `JMComic/` 内的源码。以后在 GitHub 修改该目录并提交到 main，即可在 Scripting 检查更新；不必重新下载压缩包。自动检查可在脚本设置中配置，例如每小时一次，并开启 App 的自动更新开关。

也可使用仓库内的打包文件：

https://raw.githubusercontent.com/Guanqi-Li/JMComic/main/dist/JMComic.zip

直接修改源码后，源码导入地址立即对应新版本；ZIP 需运行 `python tools/build.py` 重新打包后提交。推荐使用上面的源码目录地址。

## 功能

- 书架：账号收藏按收藏时间从新到旧排列；收藏、观看历史各预览 5 项，更多页按网站分页加载。
- 搜索：独立悬浮搜索框；回车或放大镜搜索；未搜索时展示网站首页推荐。
- 阅读：全屏，默认隐藏导航栏和状态栏，轻点唤出阅读控制。图片仅在接近可见页面时下载与还原，同时最多处理 3 张，已缓存图片直接复用。
- 登录：账号密码和 Cookie 存入 Scripting 钥匙串；会话失效后尝试自动登录。网站要求人机验证时打开正常网页，用户完成后返回重试。
- 保留四种阅读模式与设备上的阅读进度，不包含本地导入、发现页和来源切换。

## 使用

首次进入设置输入自己的 JMComic 账号密码并登录。账号密码、Cookie、个人收藏列表和调试抓包均不在仓库或安装包内。

建议使用支持 WebView Cookie 管理的最新版 Scripting。原生布局和系统全屏效果需要在 iPhone / iPad 上验证。

## 维护

源码在 `JMComic/`。修改后同步提升 `JMComic/script.json` 版本；保留同一远程导入地址。`remoteResource` 和校验 hash 由 Scripting 在导入时管理，不在源码中伪造。

打包：`python tools/build.py`。核心回归：`npm install && npm test`。

脚本基于用户提供的原始阅读脚本改造，保留原有 JM 请求与图片还原实现。网络可用性取决于 JMComic 网站、接口和当前网络。

远程导入与更新行为参见 [Scripting 官方文档](https://scriptingapp.github.io/guide/Script/Script)。

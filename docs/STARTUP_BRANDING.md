# 启动页标识

v0.3.6按用户确认保留原Emby绿色图形及emby字标，将旧启动图署名替换为THEATER ENHANCED，继续使用黑色背景。

## 实际入口与资产

- 截图中的旧署名来自冻结`www/index.html`的`.app-splash`，原资源是`modules/themes/logo.png`。vendor只读，共享主题图片保持。
- 新`src/electronapp/enhanced/startup.svg`内嵌现有`src/electronapp/logowhite.png`的完整原始PNG字节，另加副标文字；没有使用生成预览中的近似图标。原始素材权属及现有第三方通知不变。
- `tools/patch-startup.cjs`只变换原index内启动图的CSS图片来源及尺寸；80%窗口宽度、最大560px、水平居中，保留原30%顶部位置和20%高度约束，按比例contain显示。
- 沿用原`.app-splash` DOM、apploader、loader/ready及隐藏/移除行为。另一原生`splash.html`及其原标识保持，未修改窗口生命周期。

## 来源与边界

index窄变换接入`prepare-web-overlays.cjs`的固定输入/输出SHA合同，生成器加入`build-input-contract.cjs`；新SVG由普通tracked product-source复制与来源校验负责。原图标保持是素材复用结论，不是第三方授权或完整合规结论。

本批不修改播放/Session/Native、认证/IPC、依赖和默认内核；不涉及缓存或切轨延迟。交付须核对原图字节、实际完整应用启动展示/三视口、原loader继续进入下一页面、准确source构建及安装器完整payload。静态/隐藏运行与用户前台、系统安装证据分别记录；最终结果见本版发行核验。

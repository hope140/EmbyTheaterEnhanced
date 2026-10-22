'use strict';
// Independent approved text/default oracle; never imports the production generators.
const APPROVED_TRANSLATIONS = Object.freeze({
    "UserRefreshRateHelp": "按优先顺序填写刷新率，多个数值用英文分号（;）分隔，例如 23;50;60。",
    "EnableVideoDisplaySyncingHelp": "通过重采样让音频配合视频播放。选择 VDrop 时，会丢弃部分视频帧来校正时间偏差。",
    "EnableInterpolationHelp": "在视频帧率与屏幕刷新率不一致时，通过插值减轻运动画面的顿挫感。",
    "LabelNetworkCache": "缓存内存上限：",
    "LabelNetworkCacheHelp": "调整缓存所用的内存上限。增大此值会提高内存占用，不能保证跳转更快；通常可先保留自动。",
    "DefaultAudioDelay": "默认音频延迟：",
    "DefaultAudioDelayHelp": "默认的音频延迟，单位为毫秒。",
    "EnableExclusiveAudioModeHelp": "独占使用所选音频设备，其他应用通常无法通过该设备播放声音。",
    "LabelGpuApiHelp": "图形 API 的旧设置在当前 Native Helper 中不生效。实际渲染接口固定为 Direct3D 11。",
    "LabelHardwareAccelerationHelp": "硬件解码需要与显卡和驱动兼容。若画面出现色块、绿线等异常，可尝试其他解码模式或拷回方式（Copy-Back）。",
    "VideoOutputHelp": "当前 Native Helper 固定使用 gpu-next；此页的旧视频输出选项不会改变实际渲染路径。遇到画面异常时，应结合诊断信息定位原因。",
    "DisplayVDrop": "显示同步（丢帧）",
    "DisplayResample": "显示同步（重采样）"
});
const CONFIGURATION = Buffer.from("<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<!-- ETE maintained first-run defaults; existing user configuration is never replaced. -->\n<BaseApplicationConfiguration xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:xsd=\"http://www.w3.org/2001/XMLSchema\">\n  <EnableDebugLevelLogging>false</EnableDebugLevelLogging>\n  <EnableAutoUpdate>false</EnableAutoUpdate>\n  <LogFileRetentionDays>0</LogFileRetentionDays>\n  <RunAtStartup>false</RunAtStartup>\n  <IsStartupWizardCompleted>false</IsStartupWizardCompleted>\n</BaseApplicationConfiguration>\n");
function translation(original) {
    const values = JSON.parse(original.toString('utf8'));
    return Buffer.from(JSON.stringify(Object.assign(values, APPROVED_TRANSLATIONS), null, 4) + '\n');
}
function bytes(root, name, original) {
    if (name === 'config/system.xml') return CONFIGURATION;
    if (name === 'electronapp/plugins/mpvplayer/strings/zh-CN.json') return translation(original);
    return original;
}
module.exports = {APPROVED_TRANSLATIONS, CONFIGURATION, translation, bytes};

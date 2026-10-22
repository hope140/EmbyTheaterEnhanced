# ETE maintained configuration and player localization

The immutable four-file input snapshot and its manifest remain unchanged and fully validated. New runtime assembly deliberately replaces only the configuration seed and thirteen Chinese player strings using maintained source files. No new snapshot migration, user-profile rewrite or playback change accompanies this selection.

## Default configuration

`src/config/system-defaults.json` is the typed source for deterministic `config/system.xml`. Field names, values, types, root and namespaces retain the existing configuration contract:

| Field | Type | Default |
|---|---|---|
| EnableDebugLevelLogging | boolean | false |
| EnableAutoUpdate | boolean | false |
| LogFileRetentionDays | integer | 0 |
| RunAtStartup | boolean | false |
| IsStartupWizardCompleted | boolean | false |

The XML adds an UTF-8 encoding declaration and a first-run comment, uses LF with a final newline, and changes 441 to 543 bytes. Its SHA256 is `03a596810424e4b4dc0ca38280927d6b9108e5df5ed300d12c1335ebe53121e7`. Existing bootstrap/launcher code copies the seed only when the profile configuration is missing. Existing user settings and the separate profile CEC marker remain untouched. Field/default inheritance is explicit; this does not attribute the old XML to ETE or establish new rights over the old snapshot.

## Chinese player strings

`src/localization/mpvplayer/zh-CN.overrides.json` contains exactly thirteen maintained text values. `tools/small-runtime-input.cjs` applies them to the validated 37-key historical JSON, preserving all other twenty-four values, key order, formatting and the final newline. The renderer registration and resource path are unchanged. These are text-only changes; the three long GPU/video explanations become single paragraphs without `<br>`.

| Review ID | Key | Current maintained value |
|---|---|---|
| T01 | `UserRefreshRateHelp` | 按优先顺序填写刷新率，多个数值用英文分号（;）分隔，例如 23;50;60。 |
| T04 | `EnableVideoDisplaySyncingHelp` | 通过重采样让音频配合视频播放。选择 VDrop 时，会丢弃部分视频帧来校正时间偏差。 |
| T05 | `EnableInterpolationHelp` | 在视频帧率与屏幕刷新率不一致时，通过插值减轻运动画面的顿挫感。 |
| T07 | `LabelNetworkCache` | 缓存内存上限： |
| T08 | `LabelNetworkCacheHelp` | 调整缓存所用的内存上限。增大此值会提高内存占用，不能保证跳转更快；通常可先保留自动。 |
| T09 | `DefaultAudioDelay` | 默认音频延迟： |
| T10 | `DefaultAudioDelayHelp` | 默认的音频延迟，单位为毫秒。 |
| T13 | `EnableExclusiveAudioModeHelp` | 独占使用所选音频设备，其他应用通常无法通过该设备播放声音。 |
| T14 | `LabelGpuApiHelp` | 图形 API 的旧设置在当前 Native Helper 中不生效。实际渲染接口固定为 Direct3D 11。 |
| T15 | `LabelHardwareAccelerationHelp` | 硬件解码需要与显卡和驱动兼容。若画面出现色块、绿线等异常，可尝试其他解码模式或拷回方式（Copy-Back）。 |
| T16 | `VideoOutputHelp` | 当前 Native Helper 固定使用 gpu-next；此页的旧视频输出选项不会改变实际渲染路径。遇到画面异常时，应结合诊断信息定位原因。 |
| T17 | `DisplayVDrop` | 显示同步（丢帧） |
| T18 | `DisplayResample` | 显示同步（重采样） |

T02/T03/T06/T11/T12 remain original, along with the other nineteen unselected keys. No key is added or deleted; all thirty-seven remain available. These changes introduce no placeholders; checks preserve the original placeholder set. The generated JSON is 2787 bytes (original 3393), SHA256 `7f8dfdeda7709cc61ab1201df0446842c2ce5034845f4f9d278e7a5b5caff329`.

The fixed official Windows 3.0.20 `en-US.json` is the English reference where available. It lacks LabelNetworkCache, LabelNetworkCacheHelp, LabelGpuApi, LabelGpuApiHelp and LabelHardwareAccelerationHelp. Cache, API and hardware explanations in those cases are maintained product text based on current implementation, not reconstructed English originals. VideoOutputHelp also describes the current fixed Native path rather than translating the old Auto/gpu recommendation. Unchanged old strings retain their historical attribution/uncertainty; neither the entire localization nor its old authorship is claimed as newly independent ETE work. Existing notices remain applicable.

## Assembly and verification

Both maintained source files are committed build inputs. Source provenance records original manifest identities separately from generated runtime sizes/hashes, source paths/hashes and the thirteen changed keys. The small component still outputs two files; its current total is 3330 bytes and runtime tree SHA256 `7d3ee238ca2be25533b2e28d31e64ba0c179c5a064ed7091b00c71557120ced2`.

`tests/maintained-small-runtime.test.cjs` compares all keys and all lines against independent approved values, checks the unchanged XML contract and typed defaults, runs real bootstrap against synthetic first/existing profiles, and executes the actual player translation registration in an isolated VM to load the assembled JSON. It rejects invalid fields/types and unapproved translation keys before output writes. The independent material oracle applies these two explicit replacements; all other retained files remain exact hash comparisons. This is not Host/GUI, playback or installer acceptance.

The original source bodies are still in the current vendor tree. Maintaining these two outputs does not remove archival files, resolve all inherited source/license questions, rewrite Git history or alter existing releases. See [the scoped retirement record](LEGACY_RESOURCE_RETIREMENT.md).

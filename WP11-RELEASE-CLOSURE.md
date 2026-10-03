# WP11 · Release Closure

## 目标

WP11 不再扩展业务 Pattern，而是为 WP5d → WP6d → WP8 → WP9 → WP10 建立最终发布闭环。

## 最终边界

- 核心工作台只能通过 `selectAnalysisResultContract()` 消费分析结果。
- 分析结果只能通过稳定记录元数据 `analysisId + inputHash + engineVersion` 判断新鲜度。
- 当前引擎只接受当前输入指纹与当前引擎版本同时匹配的结果。
- 旧 localStorage / 旧备份只允许单向兼容读取，不能伪装成当前引擎结论。
- 分析存储 key 不得泄漏到 adapter 以外的业务层。
- 离线构建必须产出单文件 `dist-offline/index.html` 并复制到发布目录。
- 治理脚本不得依赖 Unix-only 外部 `grep`，保证 Windows / Linux 环境一致。
- 本阶段不修改任何 Pattern 的物理公式、阈值、VETO 或 AI 提示词。

## 新增最终门禁

`scripts/verify-wp11-release-closure.cjs`

它负责把核心页面、结果生命周期、备份恢复、离线构建与跨平台治理要求汇总成最后一道静态发布闸门。

## 验收定义

代码层：所有治理门禁通过，反向违规测试能够真实退出非零。

桌面发布层：`npm install`、`npm run lint`、`npm test`、`npm run build` 全部 exit 0。

完成上述条件后，本轮架构重构关闭；之后新增功能应作为独立 feature，不再继续向 WP11 填业务债务。

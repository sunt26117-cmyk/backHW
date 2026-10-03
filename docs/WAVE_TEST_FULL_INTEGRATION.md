# WAVE-Test → backHW 全能力融合

本批不是把 WAVE-Test 的原生 DOM `uiController.ts` 硬塞进 backHW，而是：

- 保留 WAVE-Test 完整工程核心：数据模型、CSV/WFM 解析、采样质量、重采样、FFT、自动测量、AutoSet、Trigger、Math、Clarke/Park、瞬时功率、BLDC 谐波、Session、Canvas renderer。
- React 工作台统一接管这些能力，避免两套 UI/事实源并存。
- 显示始终使用真实 `t[]`；只有 FFT 在发现非均匀时间轴时才线性重采样。
- 工程证据回填仍通过 backHW 既有 `buildMeasurementsFromChannels` → `MeasurementProvenance` → `waveformStorage` → Trace 链。
- 不引入 WAVE-Test 的固定 demo signal generator，禁止硬编码波形/测量结果。

应用后建议：
`npm run lint`
`npm test`
`npm run build`

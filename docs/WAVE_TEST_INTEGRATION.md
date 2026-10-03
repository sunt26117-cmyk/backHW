# WAVE-Test → backHW 融合说明

基线：`sunt26117-cmyk/backHW@d5637f56d16990a6ffc5f91d760b0efa3e7fc057`

本补丁不复制 WAVE-Test 的整套原生 DOM 应用，而是把其工程上有价值的能力迁移到 backHW 的 React/证据体系：

- 真实 `t[]` 时间基准用于波形显示、缩放和平移；不会用 `index * dt` 伪造自适应时间轴。
- FFT 分析前，非均匀时间轴自动线性重采样；原始导入波形不被改写。
- 保留 backHW 现有 `oscilloscopeImport.ts` 的工程测量口径：20–80% dv/dt、主边沿后振铃、触发前基线。
- CSV/TXT 导入后可做通道角色映射：Vbus / Vgs / Vds，并通过现有 MeasurementProvenance 回填工程事实。
- 选定的工程通道继续写入 `waveformStorage`，由现有 Trace/evidence 路径引用。
- 工作台支持 Waveform / Spectrum(FFT)、Fit、滚轮缩放、拖拽平移、X1/X2 Cursor、可见窗口 CSV 导出。

没有引入第二套工程事实，也没有把 WAVE-Test 的 `uiController.ts` 直接嵌入 backHW。

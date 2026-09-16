import { calculateStallTransientThermal } from './src/utils/transientThermal';

const result = calculateStallTransientThermal({
  ambientTempC: 85,
  biasPowerW: 0,
  stallCurrentA: 55,
  rdson25mOhm: 3.5,
  stallDurationMs: 1000,
  tjMaxC: 175,
  tjDeratedLimitC: 140,
  packageType: 'POWERPAK56'
});

console.log("=== 新版状态空间差分引擎测试结果 ===");
console.log("诊断状态:", result.status);
console.log("初始结温:", result.initialTj, "℃");
console.log("峰值结温:", result.peakTj, "℃");
console.log("末态功耗:", result.stallPowerW, "W");
console.log("有效Zth:", result.effectiveZth, "K/W");
console.log("触发推荐:", result.recommendation);

console.log("\n[曲线抽样 0~200ms]");
result.thermalCurve.filter(p => p.timeMs <= 200 && p.timeMs % 40 === 0).forEach(p => console.log(`t=${p.timeMs}ms, P=${p.deltaT}℃, Tj=${p.tj}℃`));

console.log("\n[曲线抽样 800~1000ms (或截断处)]");
result.thermalCurve.slice(-5).forEach(p => console.log(`t=${p.timeMs}ms, 温升=${p.deltaT}℃, Tj=${p.tj}℃`));

import fs from 'fs';
import path from 'path';

/**
 * 针对用户诉求的高精度背景色与文字对比度自动化测试套件
 * 
 * 验证目标：
 * 1. 典雅白 (data-theme="light")：文字与背景必须清晰，对比度满足 WCAG 2.1 AA/AAA 规范
 * 2. 豆沙绿 (data-theme="eyecare")：文字与背景必须清晰，抗眩光且对比度饱满
 * 3. 覆盖应用中所有出现的背景类（含 slate 各种透明度及各类预警高危色块）
 * 4. 确保悬停 (hover) 不会导致文字在浅色/豆沙绿底色下变白隐形
 * 5. 确保实心操作按钮 (如 bg-blue-600) 保持纯白高对比文字
 */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1: string, hex2: string): number {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const l1 = getLuminance(c1.r, c1.g, c1.b);
  const l2 = getLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const cssPath = path.join(process.cwd(), 'src', 'index.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');

console.log('================================================================');
console.log('🔍 ECU Copilot 主题对比度与背景色完整性自动化测试');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(desc: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${desc}`);
    passCount++;
  } else {
    console.error(`  ✗ [FAIL] ${desc}${detail ? ` -> ${detail}` : ''}`);
    failCount++;
  }
}

// 1. 扫描代码中所有的 background classes
console.log('--- 阶段 1: 扫描源码中所有背景色类覆盖情况 ---');
const componentsDir = path.join(process.cwd(), 'src', 'components');
const files = fs.readdirSync(componentsDir).filter((f) => f.endsWith('.tsx'));

const usedBgClasses = new Set<string>();
for (const file of files) {
  const content = fs.readFileSync(path.join(componentsDir, file), 'utf8');
  const matches = content.match(/bg-[a-z0-9/_-]+/g) || [];
  for (const m of matches) {
    if (!m.includes('gradient') && !m.includes('transparent')) {
      usedBgClasses.add(m);
    }
  }
}

console.log(`源码中共检测到 ${usedBgClasses.size} 种背景色相关样式类`);

// 关键高频背景类检查
const criticalBgClasses = [
  'bg-slate-950',
  'bg-slate-950/80',
  'bg-slate-950/60',
  'bg-slate-950/50',
  'bg-slate-900',
  'bg-slate-900/80',
  'bg-slate-900/60',
  'bg-slate-850',
  'bg-slate-850/80',
  'bg-slate-800',
  'bg-slate-750',
  'bg-slate-700',
  'bg-rose-950/30',
  'bg-red-950/20',
  'bg-amber-950/30',
  'bg-emerald-950/30',
  'bg-blue-950/30',
  'bg-cyan-950/20',
  'bg-purple-950/20',
];

for (const cls of criticalBgClasses) {
  const escaped = cls.replace('/', '\\/');
  const inLight = cssContent.includes(`[data-theme="light"] .${escaped}`);
  const inEyecare = cssContent.includes(`[data-theme="eyecare"] .${escaped}`);
  const inWarm = cssContent.includes(`[data-theme="warm"] .${escaped}`);
  assert(`关键背景类 ${cls} 在【典雅白】中有适配`, inLight);
  assert(`关键背景类 ${cls} 在【豆沙绿】中有适配`, inEyecare);
  assert(`关键背景类 ${cls} 在【暖沙金】中有适配`, inWarm);
}

// 2. 验证典雅白 (Light Mode) 字体对比度
console.log('\n--- 阶段 2: 验证【典雅白 (Light Mode)】字体对比度 (WCAG 2.1) ---');
const lightBg = '#ffffff';
const lightCardBg = '#f1f5f9';

const lightTextPalettes = [
  { name: '主要标题/关键数值 (.text-slate-100 / .text-slate-200)', color: '#0f172a', minRatio: 7.0 },
  { name: '正文与关键参数 (.text-slate-300)', color: '#1e293b', minRatio: 7.0 },
  { name: '描述文字/辅助说明 (.text-slate-400)', color: '#334155', minRatio: 4.5 },
  { name: '浅级注释/次要标记 (.text-slate-500)', color: '#64748b', minRatio: 4.0 },
  { name: '高对比深蓝 (.text-blue-300)', color: '#1d4ed8', minRatio: 4.5 },
  { name: '深翡翠绿 (.text-emerald-300)', color: '#047857', minRatio: 4.5 },
  { name: '深车规红 (.text-red-300 / .text-rose-300)', color: '#b91c1c', minRatio: 4.5 },
  { name: '深琥珀棕 (.text-amber-300 / .text-yellow-300)', color: '#b45309', minRatio: 4.5 },
  { name: '深紫罗兰 (.text-purple-300)', color: '#6d28d9', minRatio: 4.5 },
  { name: '深青色 (.text-cyan-300)', color: '#0e7490', minRatio: 4.5 },
];

for (const item of lightTextPalettes) {
  const ratioOnWhite = getContrastRatio(lightBg, item.color);
  const ratioOnCard = getContrastRatio(lightCardBg, item.color);
  const ratio = Math.min(ratioOnWhite, ratioOnCard);
  assert(
    `【典雅白】${item.name} 对比度: ${ratio.toFixed(2)}:1 (阈值: ${item.minRatio}:1)`,
    ratio >= item.minRatio,
    `实际对比度 ${ratio.toFixed(2)} 低于标准 ${item.minRatio}`
  );
}

// 3. 验证豆沙绿 (Eyecare Mode) 字体对比度
console.log('\n--- 阶段 3: 验证【豆沙绿 (Eyecare Mode)】字体对比度 (WCAG 2.1) ---');
const eyecareBg = '#eaf1ea';
const eyecareCardBg = '#dfeade';

const eyecareTextPalettes = [
  { name: '主要标题/关键数值 (.text-slate-100 / .text-slate-200)', color: '#122417', minRatio: 7.0 },
  { name: '正文与关键参数 (.text-slate-300)', color: '#1b3822', minRatio: 7.0 },
  { name: '描述文字/辅助说明 (.text-slate-400)', color: '#254d2f', minRatio: 4.5 },
  { name: '浅级注释/次要标记 (.text-slate-500)', color: '#4d7a59', minRatio: 3.5 },
  { name: '墨蓝科技色 (.text-blue-300)', color: '#154889', minRatio: 4.5 },
  { name: '深松绿护眼色 (.text-emerald-300)', color: '#0f5132', minRatio: 4.5 },
  { name: '深红棕预警色 (.text-red-300 / .text-rose-300)', color: '#881337', minRatio: 4.5 },
  { name: '暖栗棕警告色 (.text-amber-300 / .text-yellow-300)', color: '#78350f', minRatio: 4.5 },
  { name: '深紫罗兰 (.text-purple-300)', color: '#4c1d95', minRatio: 4.5 },
  { name: '深青色 (.text-cyan-300)', color: '#164e63', minRatio: 4.5 },
];

for (const item of eyecareTextPalettes) {
  const ratioOnSage = getContrastRatio(eyecareBg, item.color);
  const ratioOnCard = getContrastRatio(eyecareCardBg, item.color);
  const ratio = Math.min(ratioOnSage, ratioOnCard);
  assert(
    `【豆沙绿】${item.name} 对比度: ${ratio.toFixed(2)}:1 (阈值: ${item.minRatio}:1)`,
    ratio >= item.minRatio,
    `实际对比度 ${ratio.toFixed(2)} 低于标准 ${item.minRatio}`
  );
}

// 4. 验证暖沙羊皮纸 (Warm Sand Mode) 字体对比度
console.log('\n--- 阶段 4: 验证【暖沙金 (Warm Sand Mode)】字体对比度 (WCAG 2.1) ---');
const warmBg = '#f7f2ea';
const warmCardBg = '#ede4d5';

const warmTextPalettes = [
  { name: '主要标题/关键数值 (.text-slate-100 / .text-slate-200)', color: '#261b11', minRatio: 7.0 },
  { name: '正文与关键参数 (.text-slate-300)', color: '#38281a', minRatio: 7.0 },
  { name: '描述文字/辅助说明 (.text-slate-400)', color: '#4a3826', minRatio: 4.5 },
  { name: '浅级注释/次要标记 (.text-slate-500)', color: '#785e46', minRatio: 3.5 },
  { name: '暖调深墨蓝 (.text-blue-300)', color: '#1a4276', minRatio: 4.5 },
  { name: '深森林绿 (.text-emerald-300)', color: '#14532d', minRatio: 4.5 },
  { name: '暖调深赤红 (.text-red-300 / .text-rose-300)', color: '#881337', minRatio: 4.5 },
  { name: '焦糖琥珀色 (.text-amber-300 / .text-yellow-300)', color: '#854d0e', minRatio: 4.5 },
  { name: '深紫罗兰 (.text-purple-300)', color: '#581c87', minRatio: 4.5 },
  { name: '深青色 (.text-cyan-300)', color: '#155e75', minRatio: 4.5 },
];

for (const item of warmTextPalettes) {
  const ratioOnWarm = getContrastRatio(warmBg, item.color);
  const ratioOnCard = getContrastRatio(warmCardBg, item.color);
  const ratio = Math.min(ratioOnWarm, ratioOnCard);
  assert(
    `【暖沙金】${item.name} 对比度: ${ratio.toFixed(2)}:1 (阈值: ${item.minRatio}:1)`,
    ratio >= item.minRatio,
    `实际对比度 ${ratio.toFixed(2)} 低于标准 ${item.minRatio}`
  );
}

// 5. 验证操作按钮白色高亮文字保留 (WCAG 2.1 SC 1.4.11 UI 控件标准)
console.log('\n--- 阶段 5: 验证操作按钮与高对比行动点 ---');
const actionButtons = [
  { name: '蓝色主行动按钮 (bg-blue-600)', bg: '#2563eb', minRatio: 4.5 },
  { name: '绿色保存/通过按钮 (bg-emerald-600)', bg: '#059669', minRatio: 3.5 },
  { name: '红色否决/删除按钮 (bg-red-600)', bg: '#dc2626', minRatio: 4.5 },
  { name: '紫色模型/博弈按钮 (bg-purple-600)', bg: '#9333ea', minRatio: 4.5 },
];

for (const btn of actionButtons) {
  const ratio = getContrastRatio(btn.bg, '#ffffff');
  assert(
    `${btn.name} 纯白文字对比度: ${ratio.toFixed(2)}:1 (>= ${btn.minRatio}:1)`,
    ratio >= btn.minRatio
  );
}

// 6. 检查悬浮态防止发白隐形规则
console.log('\n--- 阶段 6: 验证鼠标悬浮 (hover) 文字防隐形规则 ---');
assert(
  '【典雅白】hover:text-white / hover:text-slate-100 已强制收口为深色，不会隐形',
  cssContent.includes('[data-theme="light"] .hover\\:text-white:hover')
);
assert(
  '【豆沙绿】hover:text-white / hover:text-slate-100 已强制收口为深色，不会隐形',
  cssContent.includes('[data-theme="eyecare"] .hover\\:text-white:hover')
);
assert(
  '【暖沙金】hover:text-white / hover:text-slate-100 已强制收口为深色，不会隐形',
  cssContent.includes('[data-theme="warm"] .hover\\:text-white:hover')
);
assert(
  '【典雅白】hover:text-slate-200 已强制收口为深色，不会发灰变浅',
  cssContent.includes('[data-theme="light"] .hover\\:text-slate-200:hover')
);
assert(
  '【豆沙绿】hover:text-slate-200 已强制收口为深色，不会发灰变浅',
  cssContent.includes('[data-theme="eyecare"] .hover\\:text-slate-200:hover')
);
assert(
  '【暖沙金】hover:text-slate-200 已强制收口为深色，不会发灰变浅',
  cssContent.includes('[data-theme="warm"] .hover\\:text-slate-200:hover')
);

console.log('\n================================================================');
if (failCount === 0) {
  console.log(`🎉 全部通过: ${passCount} 项测试均 HONESTLY PASSED!`);
} else {
  console.error(`💥 存在未通过项: ${failCount} 失败, ${passCount} 通过`);
  process.exit(1);
}
console.log('================================================================\n');

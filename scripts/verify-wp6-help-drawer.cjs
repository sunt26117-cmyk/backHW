const fs = require('fs');
const nav = fs.readFileSync('src/components/workbenchNavigation.ts', 'utf8');
const router = fs.readFileSync('src/components/AppTabRouter.tsx', 'utf8');
const workbench = fs.readFileSync('src/components/SeniorEngineeringWorkbenchView.tsx', 'utf8');
const drawer = fs.readFileSync('src/components/EngineeringWorkflowHelpDrawer.tsx', 'utf8');
const content = fs.readFileSync('src/content/domainGuides.ts', 'utf8');
const checks = [
  ['overview 不再包含 workflow 二级页', /overview:\s*\['first'\]/.test(nav)],
  ['workflow 映射到 helpDrawer', /workflow:\s*\{\s*main:\s*'overview',\s*helpDrawer:\s*'workflow'\s*\}/.test(nav)],
  ['历史 workflow 深链接被路由为帮助抽屉', /activeTab === 'workflow'/.test(router) && /setWorkflowHelpOpen\(true\)/.test(router)],
  ['工作台存在帮助入口', /打开工程工作流帮助/.test(workbench) && /onWorkflowHelpChange\(true\)/.test(workbench)],
  ['工作台挂载帮助抽屉', /<EngineeringWorkflowHelpDrawer/.test(workbench)],
  ['帮助抽屉承载 EngineeringWorkflowView', /<EngineeringWorkflowView/.test(drawer)],
  ['DOMAIN_GUIDES 已独立到 content', /export const DOMAIN_GUIDES/.test(content)],
];
let failed=false;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'} ${name}`); if (!ok) failed=true; }
if (failed) process.exit(1);
console.log(`WP6_HELP_DRAWER_PASS ${checks.length}/${checks.length}`);

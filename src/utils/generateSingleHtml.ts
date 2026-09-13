import fs from 'fs';
import path from 'path';

export function buildSingleFileHtml(): string {
  const distDir = path.join(process.cwd(), 'dist');
  const htmlPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  if (!fs.existsSync(htmlPath)) {
    throw new Error('dist/index.html 不存在，请先运行 build');
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  // 1. 读取所有 CSS 并内联到 <style>
  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const cssFiles = files.filter((f) => f.endsWith('.css'));
    let combinedCss = '';
    for (const cssFile of cssFiles) {
      const content = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
      combinedCss += `\n/* ${cssFile} */\n` + content;
    }

    // 移除原有 link stylesheet 标签并替换为 style
    html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
    html = html.replace('</head>', `<style>\n${combinedCss}\n</style>\n</head>`);

    // 2. 读取 JS 并内联为 <script type="module">
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    let combinedJs = '';
    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
      // 防止 </script> 意外切断
      const safeContent = content.replace(/<\/script>/gi, '<\\/script>');
      combinedJs += `\n// ${jsFile}\n` + safeContent;
    }

    html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '');
    html = html.replace('</body>', `<script type="module">\n${combinedJs}\n</script>\n</body>`);
  }

  return html;
}

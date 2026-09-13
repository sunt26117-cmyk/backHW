import fs from 'fs';
import path from 'path';

function inlineSingleHtml() {
  const distDir = path.join(process.cwd(), 'dist');
  const htmlPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  if (!fs.existsSync(htmlPath)) {
    console.warn('dist/index.html not found, skip bundling single-file html.');
    return;
  }

  let html = fs.readFileSync(htmlPath, 'utf8');

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    const cssFiles = files.filter((f) => f.endsWith('.css'));
    let combinedCss = '';
    for (const cssFile of cssFiles) {
      combinedCss += '\n' + fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
    }
    html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');
    html = html.replace('</head>', `<style>\n${combinedCss}\n</style>\n</head>`);

    const jsFiles = files.filter((f) => f.endsWith('.js'));
    let combinedJs = '';
    for (const jsFile of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
      combinedJs += '\n' + content.replace(/<\/script>/gi, '<\\/script>');
    }
    html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '');
    html = html.replace('</body>', `<script type="module">\n${combinedJs}\n</script>\n</body>`);
  }

  const outputPath = path.join(distDir, 'ecu-copilot-offline.html');
  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`[Offline Bundle] Successfully generated: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
}

inlineSingleHtml();

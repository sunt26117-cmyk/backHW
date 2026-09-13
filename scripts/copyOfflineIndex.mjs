import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('dist-offline/index.html');
const target = path.resolve('dist/ecu-copilot-offline.html');
if (!fs.existsSync(source)) throw new Error(`Missing offline build output: ${source}`);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied ${source} -> ${target}`);

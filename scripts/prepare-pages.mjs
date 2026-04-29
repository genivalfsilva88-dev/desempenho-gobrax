import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

const filesToPublish = [
  'index.html',
  'gobrax-data.js',
  'Logo Ziran.jpg'
];

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const file of filesToPublish) {
    const source = path.join(projectRoot, file);
    const target = path.join(distDir, file);
    await cp(source, target, { recursive: true });
  }

  console.log(`Cloudflare Pages bundle preparado em ${distDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

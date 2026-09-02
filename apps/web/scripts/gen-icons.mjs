/**
 * Gera PNGs (192/512 + apple-touch) a partir de public/icon.svg.
 * Opcional: requer `sharp` (npm i -D sharp). Se ausente, apenas avisa —
 * o app continua instalável via ícones SVG.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('[gen-icons] `sharp` não instalado. Pulando PNGs (SVG já cobre a instalação). Rode: npm i -D sharp');
  process.exit(0);
}

const svg = await readFile(join(root, 'icon.svg'));
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of targets) {
  const png = await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(join(root, name), png);
  console.log(`[gen-icons] ${name} (${size}x${size})`);
}

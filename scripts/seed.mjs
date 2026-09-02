/**
 * Seed do banco (Cloudflare D1). Gera SQL a partir das constantes compartilhadas
 * + cria o usuário admin inicial (senha com PBKDF2, igual ao Worker) e aplica via
 * `wrangler d1 execute`.
 *
 * Uso:
 *   node scripts/seed.mjs --local     # D1 local (wrangler dev / miniflare)
 *   node scripts/seed.mjs --remote    # D1 remoto (produção)
 *
 * Admin: definido por SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD (ver .env.example).
 */
import { build } from 'esbuild';
import { webcrypto as crypto } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv.includes('--remote') ? '--remote' : '--local';

// Carrega variáveis de apps/api/.dev.vars ou .env (simples KEY=VALUE).
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(join(root, 'apps/api/.dev.vars'));
loadEnvFile(join(root, '.env'));

// Bundla o gerador de seed (TS) para conseguir importá-lo no Node.
const out = await build({
  entryPoints: [join(root, 'packages/database/src/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
});
const tmp = mkdtempSync(join(tmpdir(), 'wise-seed-'));
const bundlePath = join(tmp, 'seed-gen.mjs');
writeFileSync(bundlePath, out.outputFiles[0].text);
const { seedSql } = await import(pathToFileURL(bundlePath).href);

// PBKDF2-SHA256 idêntico ao apps/api/src/auth.ts.
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  return { hash: hex(bits), salt: hex(salt.buffer) };
}

const phone = process.env.SEED_ADMIN_PHONE || '+5500000000000';
const password = process.env.SEED_ADMIN_PASSWORD || 'change-me-now';
const { hash, salt } = await hashPassword(password);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const adminSql = `\nINSERT INTO users (name, phone, password_hash, password_salt, role)\nVALUES ('Administrador', ${q(phone)}, ${q(hash)}, ${q(salt)}, 'admin')\nON CONFLICT(phone) DO UPDATE SET password_hash=excluded.password_hash, password_salt=excluded.password_salt, role='admin', active=1;\n`;

const fullSql = seedSql() + '\n' + adminSql;
const sqlPath = join(tmp, 'seed.sql');
writeFileSync(sqlPath, fullSql);

console.log(`[seed] aplicando seed em D1 (${target}). Admin: ${phone}`);
// Usa a config gerada pelo deploy (com o database_id real) quando existir.
const generatedCfg = join(root, 'apps/api', 'wrangler.generated.toml');
const cfgArgs = target === '--remote' && existsSync(generatedCfg) ? ['--config', generatedCfg] : [];
const res = spawnSync('npx', ['wrangler', 'd1', 'execute', 'wise_news', target, ...cfgArgs, '--file', sqlPath], {
  cwd: join(root, 'apps/api'),
  stdio: 'inherit',
});
if (res.status !== 0) {
  console.error('[seed] Falha ao aplicar. Verifique se o D1 "wise_news" existe (ver docs/DEPLOY.md).');
  console.error(`[seed] SQL gerado em: ${sqlPath}`);
  process.exit(res.status ?? 1);
}
console.log('[seed] concluído. Troque a senha do admin após o primeiro login.');

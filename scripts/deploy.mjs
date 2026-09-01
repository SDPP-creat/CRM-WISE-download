/**
 * WISE NEWS — deploy automatizado na Cloudflare (plano GRATUITO: D1 + KV + Cron
 * + Pages, sem Queues/R2).
 *
 * Pré-requisitos (variáveis de ambiente):
 *   CLOUDFLARE_API_TOKEN   (token com Workers Scripts:Edit, Workers KV:Edit,
 *                           D1:Edit, Cloudflare Pages:Edit, Account Settings:Read)
 *   CLOUDFLARE_ACCOUNT_ID
 * Opcionais:
 *   ANTHROPIC_API_KEY, ANTHROPIC_MODEL   (liga a IA)
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
 *   GITHUB_TOKEN, STACKEXCHANGE_KEY
 *   SEED_ADMIN_PHONE, SEED_ADMIN_PASSWORD (admin inicial; default abaixo)
 *   PAGES_PROJECT   (nome do projeto Pages; default "wise-news")
 *
 * Uso:  node scripts/deploy.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');
const webDir = join(root, 'apps', 'web');
const PAGES_PROJECT = process.env.PAGES_PROJECT || 'wise-news';

function need(name) {
  if (!process.env[name]) {
    console.error(`\n[deploy] Falta a variável ${name}. Veja o cabeçalho de scripts/deploy.mjs.`);
    process.exit(1);
  }
}
need('CLOUDFLARE_API_TOKEN');
need('CLOUDFLARE_ACCOUNT_ID');

const env = { ...process.env };

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { cwd: opts.cwd || apiDir, env, encoding: 'utf8', input: opts.input });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status !== 0 && !opts.allowFail) {
    console.error(`[deploy] comando falhou (status ${res.status}).`);
    process.exit(res.status ?? 1);
  }
  return `${res.stdout || ''}\n${res.stderr || ''}`;
}
const wr = (args, opts) => run('npx', ['wrangler', ...args], opts);

// --- 1) D1: cria (ou reutiliza) e captura o database_id -------------------
console.log('\n=== 1/7 D1 ===');
let out = wr(['d1', 'create', 'wise_news'], { allowFail: true });
let dbId = (out.match(/database_id\s*=\s*"([0-9a-f-]+)"/i) || [])[1];
if (!dbId) {
  const list = wr(['d1', 'list', '--json'], { allowFail: true });
  try {
    const arr = JSON.parse(list.slice(list.indexOf('['), list.lastIndexOf(']') + 1));
    dbId = (arr.find((d) => d.name === 'wise_news') || {}).uuid;
  } catch { /* ignore */ }
}
if (!dbId) { console.error('[deploy] não consegui obter o database_id do D1.'); process.exit(1); }
console.log(`[deploy] D1 database_id = ${dbId}`);

// --- 2) KV: cria (ou reutiliza) e captura o id ----------------------------
console.log('\n=== 2/7 KV ===');
out = wr(['kv', 'namespace', 'create', 'KV'], { allowFail: true });
let kvId = (out.match(/id\s*=\s*"([0-9a-f]+)"/i) || [])[1];
if (!kvId) {
  const list = wr(['kv', 'namespace', 'list'], { allowFail: true });
  try {
    const arr = JSON.parse(list.slice(list.indexOf('['), list.lastIndexOf(']') + 1));
    kvId = (arr.find((n) => /(-|^)KV$/.test(n.title) || n.title === 'wise-news-api-KV') || arr[0] || {}).id;
  } catch { /* ignore */ }
}
if (!kvId) { console.error('[deploy] não consegui obter o id do KV.'); process.exit(1); }
console.log(`[deploy] KV id = ${kvId}`);

// --- 3) Gera wrangler.generated.toml com os IDs reais ---------------------
console.log('\n=== 3/7 config ===');
const genPath = join(apiDir, 'wrangler.generated.toml');
let toml = readFileSync(join(apiDir, 'wrangler.toml'), 'utf8')
  .replace('REPLACE_WITH_D1_DATABASE_ID', dbId)
  .replace('REPLACE_WITH_KV_ID', kvId);
writeFileSync(genPath, toml);
const cfg = ['--config', genPath];
console.log(`[deploy] gerado ${genPath}`);

// --- 4) Migrations + seed (remoto) ----------------------------------------
console.log('\n=== 4/7 migrations + seed ===');
wr(['d1', 'migrations', 'apply', 'wise_news', '--remote', ...cfg]);
if (!process.env.SEED_ADMIN_PHONE) env.SEED_ADMIN_PHONE = '+5511999999999';
if (!process.env.SEED_ADMIN_PASSWORD) env.SEED_ADMIN_PASSWORD = 'suasenha123';
run('node', [join(root, 'scripts', 'seed.mjs'), '--remote'], { cwd: root });

// --- 5) Secrets (só os que existirem no ambiente) -------------------------
console.log('\n=== 5/7 secrets ===');
const secrets = ['ANTHROPIC_API_KEY', 'REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT', 'GITHUB_TOKEN', 'STACKEXCHANGE_KEY'];
for (const name of secrets) {
  if (process.env[name]) {
    wr(['secret', 'put', name, ...cfg], { input: `${process.env[name]}\n` });
  }
}

// --- 6) Deploy do Worker (API) --------------------------------------------
console.log('\n=== 6/7 deploy API ===');
out = wr(['deploy', ...cfg]);
const apiUrl = (out.match(/https:\/\/[^\s]*workers\.dev/i) || [])[0] || `https://wise-news-api.<sua-conta>.workers.dev`;
console.log(`[deploy] API: ${apiUrl}`);

// --- 7) Build + deploy do site (Pages) ------------------------------------
console.log('\n=== 7/7 deploy site (Pages) ===');
run('npm', ['run', 'build'], { cwd: webDir, input: undefined, env: { ...env, VITE_API_URL: apiUrl } });
// garante o projeto Pages (idempotente)
wr(['pages', 'project', 'create', PAGES_PROJECT, '--production-branch', 'main'], { allowFail: true });
out = wr(['pages', 'deploy', join(webDir, 'dist'), '--project-name', PAGES_PROJECT, '--commit-dirty=true']);
const pagesUrl = (out.match(/https:\/\/[^\s]*pages\.dev/i) || [])[0] || `https://${PAGES_PROJECT}.pages.dev`;

console.log('\n==================================================');
console.log(' DEPLOY CONCLUÍDO');
console.log(`  Site (abra este):  ${pagesUrl}`);
console.log(`  API:               ${apiUrl}`);
console.log(`  Admin login:       ${env.SEED_ADMIN_PHONE} / ${env.SEED_ADMIN_PASSWORD}`);
console.log('  No app: Perfil -> Painel admin -> Coletar agora.');
console.log('==================================================\n');

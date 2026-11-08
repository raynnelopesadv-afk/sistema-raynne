#!/usr/bin/env node
// Setup local do BI Suite: valida o ambiente, instala dependencias e prepara o .env.
// Uso: node scripts/setup.mjs
// Nao toca no banco (isso e feito pela Supabase CLI, ver README) nem sobrescreve
// um .env existente.

import { execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const log = (m) => console.log(`\n> ${m}`);
const ok = (m) => console.log(`  [ok] ${m}`);
const warn = (m) => console.log(`  [!] ${m}`);

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', cwd: root });
}

// 1) Versao do Node
log('Verificando Node.js...');
const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  warn(`Node ${process.versions.node} detectado. Requer 18+ (ideal 20 LTS). Atualize e rode de novo.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// 2) Dependencias
log('Instalando dependencias (npm install)...');
try {
  run('npm install');
  ok('Dependencias instaladas.');
} catch {
  warn('Falha no npm install. Rode manualmente e verifique os erros.');
  process.exit(1);
}

// 3) .env
log('Preparando .env...');
const env = join(root, '.env');
const example = join(root, '.env.example');
if (existsSync(env)) {
  ok('.env ja existe (mantido como esta).');
} else if (existsSync(example)) {
  copyFileSync(example, env);
  ok('.env criado a partir do .env.example. PREENCHA as variaveis VITE_* com as chaves do seu Supabase.');
} else {
  warn('.env.example nao encontrado.');
}

// 4) Proximos passos
log('Setup local concluido. Proximos passos (ver README.md):');
console.log(`
  1. Edite o .env com as chaves do SEU projeto Supabase (Project Settings > API).
  2. Prepare o banco:
       supabase link --project-ref SEU_PROJECT_REF
       supabase db push
  3. (Opcional) Configure as integracoes:
       supabase secrets set LIDERHUB_COMPANY_KEY=...  --project-ref SEU_PROJECT_REF
       supabase secrets set META_ACCESS_TOKEN=...     --project-ref SEU_PROJECT_REF
       supabase secrets set META_AD_ACCOUNT_ID=act_...--project-ref SEU_PROJECT_REF
       supabase functions deploy ingest-attribution --no-verify-jwt --project-ref SEU_PROJECT_REF
  4. Rode o app:
       npm run dev
  5. Cadastre-se: o primeiro usuario vira gestor (admin).

  Confira o INSTALL_CHECKLIST.md para nao esquecer nenhum passo.
`);

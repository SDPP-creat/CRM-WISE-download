# =============================================================================
# WISE NEWS — subir tudo localmente no Windows com UM comando.
# Uso (PowerShell, dentro da pasta do projeto):
#   .\scripts\start-local.ps1
# Faz: instala deps (se preciso) -> migrations -> seed (admin) -> API (8791) +
# site (5173). Abre a API em uma nova janela e o site nesta janela.
# =============================================================================
$ErrorActionPreference = "Stop"

# Vai para a raiz do projeto (pasta acima de /scripts), independente de onde rodar.
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "Projeto: $root" -ForegroundColor Cyan

# 1) Dependencias
if (-not (Test-Path "node_modules")) {
  Write-Host "Instalando dependencias (npm install)..." -ForegroundColor Yellow
  npm install
}

# 2) Migrations (banco local D1)
Write-Host "Aplicando migrations no banco local..." -ForegroundColor Yellow
Push-Location "apps\api"
npx wrangler d1 migrations apply wise_news --local
Pop-Location

# 3) Seed do admin (use suas variaveis ou os padroes abaixo)
if (-not $env:SEED_ADMIN_PHONE)    { $env:SEED_ADMIN_PHONE = "+5511999999999" }
if (-not $env:SEED_ADMIN_PASSWORD) { $env:SEED_ADMIN_PASSWORD = "suasenha123" }
Write-Host "Criando/atualizando admin: $($env:SEED_ADMIN_PHONE)" -ForegroundColor Yellow
node scripts/seed.mjs --local

# 4) Sobe a API (porta 8791) em uma NOVA janela
Write-Host "Iniciando API em nova janela (http://localhost:8791)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit","-Command","Set-Location '$root\apps\api'; npx wrangler dev --port 8791"

# 5) Espera a API responder e sobe o site nesta janela
Write-Host "Aguardando a API..." -ForegroundColor Yellow
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "http://localhost:8791/health" -TimeoutSec 2
    if ($r.service -eq "wise-news-api") { $ok = $true; break }
  } catch { Start-Sleep -Seconds 2 }
}
if ($ok) { Write-Host "API no ar!" -ForegroundColor Green }
else { Write-Host "A API demorou a responder — verifique a outra janela." -ForegroundColor Red }

Write-Host ""
Write-Host "Abrindo o site em http://localhost:5173" -ForegroundColor Green
Write-Host "Login: $($env:SEED_ADMIN_PHONE) / $($env:SEED_ADMIN_PASSWORD)" -ForegroundColor Cyan
Write-Host "(Para parar: feche as duas janelas do PowerShell.)" -ForegroundColor DarkGray
Write-Host ""
npm run dev:web

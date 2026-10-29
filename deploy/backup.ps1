# Copia de seguridad de la base de datos (incluye las fotos) en <carpeta>\backups\gestion-moldes-<fecha>.dump.
# Se ejecuta a diario con la tarea programada que crea scripts/setup-host.ps1, o a mano:
#   powershell -ExecutionPolicy Bypass -File deploy\backup.ps1
# Works both from the repository folder and from the deploy folder: both keep .env and the compose file one level up.
param([int]$Keep = 30)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.prod.yml'), '--env-file', (Join-Path $root '.env'))
$dir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$name = "gestion-moldes-$(Get-Date -Format yyyyMMdd-HHmm).dump"

# pg_dump writes inside the container and the file is copied out: piping it through PowerShell would re-encode the
# text and could corrupt accented characters.
docker @compose exec -T postgres pg_dump -U fichas -Fc -f /tmp/backup.dump fichas
if ($LASTEXITCODE -ne 0) { throw "pg_dump ha fallado" }
Push-Location $dir
try {
  # Relative destination: "C:\..." would be read as a container named "C".
  docker @compose cp postgres:/tmp/backup.dump ".\$name"
  if ($LASTEXITCODE -ne 0) { throw "no se pudo copiar la copia de seguridad" }
} finally {
  Pop-Location
}
docker @compose exec -T postgres rm -f /tmp/backup.dump | Out-Null

Get-ChildItem $dir -Filter 'gestion-moldes-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep |
  Remove-Item -Force
Write-Host "Copia guardada en $(Join-Path $dir $name)"

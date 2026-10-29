# Restaura una copia hecha con backup.ps1. SUSTITUYE todos los datos actuales por los de la copia.
#   powershell -ExecutionPolicy Bypass -File deploy\restore.ps1 -File backups\gestion-moldes-20261101-0300.dump
param([Parameter(Mandatory = $true)][string]$File)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.prod.yml'), '--env-file', (Join-Path $root '.env'))
$path = (Resolve-Path $File).Path

$answer = Read-Host "Se borrarán los datos actuales y se cargará $path. Escribe SI para continuar"
if ($answer -ne 'SI') { Write-Host "Cancelado."; exit 1 }

Push-Location (Split-Path $path -Parent)
try {
  docker @compose cp ".\$(Split-Path $path -Leaf)" postgres:/tmp/restore.dump
  if ($LASTEXITCODE -ne 0) { throw "no se pudo copiar el fichero al contenedor" }
} finally {
  Pop-Location
}
docker @compose stop web
docker @compose exec -T postgres pg_restore -U fichas -d fichas --clean --if-exists --no-owner /tmp/restore.dump
$restored = $LASTEXITCODE
docker @compose exec -T postgres rm -f /tmp/restore.dump | Out-Null
docker @compose start web
if ($restored -ne 0) { throw "pg_restore ha terminado con errores (código $restored)" }
Write-Host "Restauración completada."

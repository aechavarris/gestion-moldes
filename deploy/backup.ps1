# Dumps the database to backups\fichas-<date>.sql on the host PC (Windows PowerShell).
# Schedule it with the Task Scheduler, or run it by hand before updates.
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path backups | Out-Null
$file = "backups\fichas-$(Get-Date -Format yyyyMMdd-HHmm).sql"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U fichas fichas | Out-File -Encoding utf8 $file
Write-Host "Backup written to $file"

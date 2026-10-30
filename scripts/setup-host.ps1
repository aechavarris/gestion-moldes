<#
.SYNOPSIS
  Prepara un PC con Windows para alojar Gestión de moldes y desplegarlo solo desde GitHub Actions.

.DESCRIPTION
  Hace todo lo necesario, y se puede volver a ejecutar sin romper nada (salta lo que ya está hecho):
    1. Comprueba Windows, 64 bits, virtualización y espacio en disco.
    2. Activa WSL 2 (lo necesita Docker Desktop) y reinicia si hace falta: el script se relanza solo al volver.
    3. Instala Git, GitHub CLI y Docker Desktop (y, salvo -SinHerramientasDesarrollo, Node 24 LTS, pnpm y VS Code).
    4. Añade el usuario al grupo docker-users, arranca Docker Desktop y lo deja arrancando con la sesión.
    5. Evita que el PC se suspenda (pregunta antes).
    6. Inicia sesión en GitHub y crea un repositorio PRIVADO en tu cuenta con una copia del código.
    7. Crea la carpeta de despliegue con su .env (contraseña de base de datos aleatoria + clave de Tailscale).
    8. Instala un runner de GitHub Actions en este PC, que arranca con la sesión, y las variables del repositorio,
       para que cada cambio en main se despliegue aquí con Docker automáticamente.
    9. Sube el código, espera al primer despliegue y programa una copia de seguridad diaria.

  Ejecútalo desde una cuenta de Windows con permisos de administrador (pedirá confirmación de UAC):
    powershell -ExecutionPolicy Bypass -File setup-host.ps1 -Origen C:\Users\yo\Downloads\gestion-moldes.bundle

.PARAMETER Origen
  De dónde copiar el código: un fichero .bundle (git bundle create ... --all), un .zip descargado de GitHub,
  una carpeta con el código, o la URL de un repositorio al que tengas acceso. Solo hace falta la primera vez.

.PARAMETER Repositorio
  Nombre del repositorio que se creará en tu cuenta de GitHub (privado).

.PARAMETER Carpeta
  Carpeta base en este PC: <Carpeta>\app (despliegue, .env, copias) y <Carpeta>\runner (runner de Actions).

.PARAMETER NombreTailscale
  Nombre de la máquina en Tailscale: la app quedará en https://<NombreTailscale>.<tu-tailnet>.ts.net
#>
[CmdletBinding()]
param(
  [string]$Origen,
  [string]$Repositorio = 'gestion-moldes',
  [string]$Carpeta = 'C:\gestion-moldes',
  [string]$NombreTailscale = 'fichas',
  [switch]$SinHerramientasDesarrollo
)

$ErrorActionPreference = 'Stop'
$restarting = $false
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RunnerLabel = 'gestion-moldes'
$RunnerTask = 'GestionMoldes-Runner'
$BackupTask = 'GestionMoldes-Backup'
$ResumeName = 'GestionMoldesSetup'
$AppDir = Join-Path $Carpeta 'app'
$RunnerDir = Join-Path $Carpeta 'runner'
$Me = "$env:USERDOMAIN\$env:USERNAME"

function Write-Step([string]$Text) { Write-Host ""; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    OK: $Text" -ForegroundColor Green }
function Write-Note([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }

function Confirm-Choice([string]$Question) {
  $answer = Read-Host "$Question [S/n]"
  return ($answer -eq '' -or $answer -match '^(s|si|sí|y|yes)$')
}

<# Runs a native command and stops on a non-zero exit code (PowerShell 5.1 does not do this by itself). #>
function Invoke-Native([scriptblock]$Command, [string]$What) {
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What ha fallado (código $LASTEXITCODE)" }
}

<#
  Windows PowerShell 5.1 turns a native command's redirected stderr into a terminating error under
  $ErrorActionPreference = 'Stop', even when the command succeeds. These two helpers run it with 'Continue' instead.
#>
function Test-Native([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Command *> $null; return ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $previous }
}
function Get-NativeOutput([scriptblock]$Command) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & $Command 2>$null; if ($LASTEXITCODE -ne 0) { return $null }; return $output }
  finally { $ErrorActionPreference = $previous }
}

<#
  Docker Desktop can live anywhere (winget's default, a per-user install, or a custom folder chosen by hand): ask the
  running app first, then the uninstall entries, then the default folders. Empty when none is found.
#>
function Find-DockerDesktop {
  $running = Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue | Where-Object { $_.Path } | Select-Object -First 1
  if ($running) { return $running.Path }
  $uninstall = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\Docker Desktop'
  foreach ($key in "HKLM:\$uninstall", "HKCU:\$uninstall") {
    $location = (Get-ItemProperty -Path $key -ErrorAction SilentlyContinue).InstallLocation
    if ($location -and (Test-Path (Join-Path $location 'Docker Desktop.exe'))) { return (Join-Path $location 'Docker Desktop.exe') }
  }
  $candidates = @(
    (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe')
  )
  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

<# winget, Docker and Git add themselves to PATH in the registry; this session only sees it after a reload. #>
function Update-SessionPath {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Get-ArgumentLine {
  $parts = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($Origen) { $parts += @('-Origen', "`"$Origen`"") }
  $parts += @('-Repositorio', "`"$Repositorio`"", '-Carpeta', "`"$Carpeta`"", '-NombreTailscale', "`"$NombreTailscale`"")
  if ($SinHerramientasDesarrollo) { $parts += '-SinHerramientasDesarrollo' }
  return ($parts -join ' ')
}

# ---------------------------------------------------------------------------------------------------------------------
# 0. Administrator rights
# ---------------------------------------------------------------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
# Before elevating: the elevated window starts in System32, where a relative path would no longer resolve.
if ($Origen -and (Test-Path $Origen)) { $Origen = (Resolve-Path $Origen).Path }
if (-not $isAdmin) {
  Write-Host "Hace falta ejecutar como administrador: se abrirá una ventana nueva (acepta el aviso de Windows)."
  Start-Process powershell.exe -Verb RunAs -ArgumentList (Get-ArgumentLine)
  exit 0
}
New-Item -ItemType Directory -Force -Path $Carpeta | Out-Null
Start-Transcript -Path (Join-Path $Carpeta 'setup.log') -Append | Out-Null
try {

# ---------------------------------------------------------------------------------------------------------------------
# 1. Requirements
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Comprobando el PC"
if (-not [Environment]::Is64BitOperatingSystem) { throw "Docker Desktop necesita Windows de 64 bits." }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 19045) { throw "Docker Desktop necesita Windows 10 22H2 (compilación 19045) o Windows 11. Este PC tiene la $($build): actualiza Windows." }
Write-Ok "Windows compilación $build, 64 bits"

$cs = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
# With a hypervisor already running, the firmware flag reads false even though virtualization is on.
if (-not $cs.HypervisorPresent -and -not $cpu.VirtualizationFirmwareEnabled) {
  throw "La virtualización está desactivada. Actívala en la BIOS/UEFI (Intel VT-x / AMD-V o SVM) y vuelve a ejecutar el script."
}
Write-Ok "Virtualización activada"

$drive = Get-PSDrive -Name ($Carpeta.Substring(0, 1))
if ($drive.Free -lt 20GB) { Write-Note "Solo quedan $([math]::Round($drive.Free / 1GB)) GB libres en $($drive.Name):. Docker necesita unos 20 GB." }
else { Write-Ok "$([math]::Round($drive.Free / 1GB)) GB libres" }

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Start-Process 'ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1'
  throw "Falta winget. Se ha abierto la Microsoft Store: instala o actualiza 'Instalador de aplicación' y vuelve a ejecutar el script."
}
Write-Ok "winget disponible"

# ---------------------------------------------------------------------------------------------------------------------
# 2. WSL 2
# ---------------------------------------------------------------------------------------------------------------------
$needsRestart = $false
Write-Step "Activando WSL 2 (lo necesita Docker Desktop)"
foreach ($feature in 'Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform') {
  if ((Get-WindowsOptionalFeature -Online -FeatureName $feature).State -ne 'Enabled') {
    $result = Enable-WindowsOptionalFeature -Online -FeatureName $feature -All -NoRestart
    if ($result.RestartNeeded) { $needsRestart = $true }
    Write-Ok "$feature activado"
  } else {
    Write-Ok "$feature ya estaba activado"
  }
}

# ---------------------------------------------------------------------------------------------------------------------
# 3. Programs
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Instalando programas"
$packages = [ordered]@{ 'Git.Git' = 'Git'; 'GitHub.cli' = 'GitHub CLI'; 'Docker.DockerDesktop' = 'Docker Desktop' }
if (-not $SinHerramientasDesarrollo) {
  $packages['OpenJS.NodeJS.LTS'] = 'Node.js LTS'
  $packages['Microsoft.VisualStudioCode'] = 'Visual Studio Code'
}
foreach ($id in $packages.Keys) {
  if (Test-Native { winget list --id $id --exact --accept-source-agreements }) { Write-Ok "$($packages[$id]) ya estaba instalado"; continue }
  Write-Host "    Instalando $($packages[$id])..."
  winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
  # -1978335189 = "already installed / no applicable upgrade"; -1978334967 = "installed, restart to finish".
  if ($LASTEXITCODE -notin 0, -1978335189, -1978334967) { throw "No se pudo instalar $($packages[$id]) (código $LASTEXITCODE)" }
  if ($id -eq 'Docker.DockerDesktop' -or $LASTEXITCODE -eq -1978334967) { $needsRestart = $true }
  Write-Ok "$($packages[$id]) instalado"
}
Update-SessionPath
if (-not $SinHerramientasDesarrollo -and -not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Invoke-Native { npm install -g pnpm@10 } "Instalar pnpm"
  Update-SessionPath
  Write-Ok "pnpm instalado"
}

# Docker Desktop only lets members of docker-users use the engine; membership applies at the next sign-in.
Write-Step "Dando permiso de Docker a $Me"
$members = Get-NativeOutput { net localgroup docker-users }
if ($null -eq $members) {
  # Docker Desktop's installer normally creates it, but an install made earlier by hand (or per user) may not have:
  # creating it here is what the installer would do.
  Invoke-Native { net localgroup docker-users /add | Out-Null } "Crear el grupo docker-users"
  Write-Ok "grupo docker-users creado"
  $members = @()
}
if ($members -match "(^|\\)$([regex]::Escape($env:USERNAME))\s*$") {
  Write-Ok "ya está en docker-users"
} else {
  Invoke-Native { net localgroup docker-users $Me /add } "Añadir $Me a docker-users"
  $needsRestart = $true
  Write-Ok "añadido a docker-users"
}

if ($needsRestart) {
  Write-Step "Hace falta reiniciar Windows"
  # RunOnce relaunches this script once at the next sign-in (it asks for administrator rights again).
  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name $ResumeName `
    -Value "powershell.exe $(Get-ArgumentLine)"
  Write-Note "Al volver a iniciar sesión, el script continuará solo donde se quedó."
  if (Confirm-Choice "¿Reiniciar ahora?") { $restarting = $true; Restart-Computer -Force; exit 0 }
  Write-Note "Reinicia cuando puedas; el script seguirá al iniciar sesión."
  exit 0
}

Write-Step "Actualizando WSL"
wsl.exe --update
wsl.exe --set-default-version 2 | Out-Null
Write-Ok "WSL 2 listo"

# ---------------------------------------------------------------------------------------------------------------------
# 4. Docker Desktop
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Arrancando Docker Desktop"
$DockerExe = Find-DockerDesktop
# Start with the session: the app, the runner and the backups all need it, and it only runs while someone is signed in.
if ($DockerExe) {
  Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'Docker Desktop' -Value "`"$DockerExe`""
  Write-Ok "Docker Desktop arrancará al iniciar sesión ($DockerExe)"
} else {
  Write-Note "No se ha encontrado el programa de Docker Desktop: actívalo tú en Docker Desktop > Settings > General >"
  Write-Note "'Start Docker Desktop when you sign in'."
}
if (-not (Test-Native { docker info })) {
  if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) {
    if (-not $DockerExe) { throw "Docker no está en marcha y no se encuentra Docker Desktop. Ábrelo a mano y vuelve a ejecutar el script." }
    Start-Process $DockerExe
  }
  Write-Note "La primera vez Docker Desktop muestra su acuerdo de licencia: acéptalo en su ventana (puedes saltarte"
  Write-Note "el inicio de sesión y la encuesta). Es gratis para uso personal y empresas pequeñas (<250 empleados)."
  $deadline = (Get-Date).AddMinutes(15)
  do {
    Start-Sleep -Seconds 5
    $dockerUp = Test-Native { docker info }
  } while (-not $dockerUp -and (Get-Date) -lt $deadline)
  if (-not $dockerUp) { throw "Docker no ha arrancado en 15 minutos. Ábrelo a mano, comprueba que no muestra errores y vuelve a ejecutar el script." }
}
Write-Ok "Docker funciona ($(docker version --format '{{.Server.Version}}'))"

# ---------------------------------------------------------------------------------------------------------------------
# 5. Power
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Energía"
Write-Note "Si el PC se suspende, la app deja de responder desde el móvil."
if (Confirm-Choice "¿Evitar que el PC se suspenda o hiberne cuando está enchufado? (la pantalla sí se apagará)") {
  powercfg /change standby-timeout-ac 0
  powercfg /change hibernate-timeout-ac 0
  Write-Ok "el PC no se suspenderá enchufado"
}
Write-Note "Docker y el runner solo funcionan con la sesión de Windows iniciada: tras un corte de luz o un reinicio,"
Write-Note "alguien tiene que iniciar sesión (o configura el inicio de sesión automático con Autologon de Microsoft)."

# ---------------------------------------------------------------------------------------------------------------------
# 6. GitHub: sign in and create the private repository
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Iniciando sesión en GitHub"
if (-not (Test-Native { gh auth status --hostname github.com })) {
  Write-Note "Se abrirá el navegador: copia el código que aparece aquí e inicia sesión con TU cuenta de GitHub."
  Invoke-Native { gh auth login --hostname github.com --git-protocol https --web --scopes 'repo,workflow' } "Iniciar sesión en GitHub"
}
# Pushing .github/workflows needs the workflow scope, which an older gh login may lack.
$scopes = (Get-NativeOutput { gh api -i user } | Select-String -Pattern '^X-Oauth-Scopes:' | Select-Object -First 1)
if ($scopes -and "$scopes" -notmatch '\bworkflow\b') {
  Invoke-Native { gh auth refresh --hostname github.com --scopes 'repo,workflow' } "Ampliar permisos de GitHub"
}
Invoke-Native { gh auth setup-git --hostname github.com } "Configurar git con GitHub CLI"
$login = gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or -not $login) { throw "No se pudo leer tu usuario de GitHub" }
$FullName = "$login/$Repositorio"
Write-Ok "sesión iniciada como $login"

Write-Step "Repositorio privado $FullName"
if (-not (Test-Native { gh repo view $FullName --json name })) {
  Invoke-Native { gh repo create $FullName --private --description 'Clientes y fichas técnicas de inyección' } "Crear el repositorio"
  Write-Ok "creado"
} else {
  Write-Ok "ya existía"
}
$branchCount = gh api "repos/$FullName/branches" --jq 'length'
$repoIsEmpty = ($branchCount -eq '0')

# The Deploy workflow only runs where these variables exist, so copies without a runner never queue a job forever.
Invoke-Native { gh variable set DEPLOY_TARGET --repo $FullName --body 'self-hosted' } "Guardar la variable DEPLOY_TARGET"
Invoke-Native { gh variable set DEPLOY_DIR --repo $FullName --body $AppDir } "Guardar la variable DEPLOY_DIR"
Write-Ok "variables DEPLOY_TARGET y DEPLOY_DIR guardadas"

# ---------------------------------------------------------------------------------------------------------------------
# 7. Deploy folder and .env
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Carpeta de despliegue $AppDir"
New-Item -ItemType Directory -Force -Path (Join-Path $AppDir 'deploy'), (Join-Path $AppDir 'backups') | Out-Null
$envFile = Join-Path $AppDir '.env'
if (Test-Path $envFile) {
  Write-Ok ".env ya existe (no se toca: la contraseña de la base de datos no debe cambiar)"
} else {
  Write-Host ""
  Write-Host "    Tailscale es la VPN por la que entraréis desde el móvil. Se abrirá su web:" -ForegroundColor White
  Write-Host "      1. Entra o crea una cuenta (será la 'tailnet' donde estarán este PC y los móviles)."
  Write-Host "      2. En DNS: activa 'MagicDNS' y, más abajo, 'HTTPS Certificates'."
  Write-Host "      3. En Settings > Keys: 'Generate auth key' (sin marcar Reusable ni Ephemeral) y cópiala."
  Start-Process 'https://login.tailscale.com/admin/dns'
  Start-Process 'https://login.tailscale.com/admin/settings/keys'
  do {
    $secure = Read-Host "    Pega aquí la auth key de Tailscale (no se mostrará)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $tsKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($tsKey -notmatch '^tskey-') { Write-Note "Eso no parece una clave de Tailscale (empieza por 'tskey-'). Prueba otra vez." }
  } while ($tsKey -notmatch '^tskey-')

  $bytes = New-Object byte[] 24
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $dbPassword = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $content = @(
    '# Generated by scripts/setup-host.ps1. Never commit or share this file.',
    '# Database password: do not change it after the first start.',
    "POSTGRES_PASSWORD=$dbPassword",
    "TS_AUTHKEY=$tsKey",
    "TS_HOSTNAME=$NombreTailscale",
    ''
  ) -join "`n"
  [IO.File]::WriteAllText($envFile, $content)
  # Only this user, the system and administrators can read it (SIDs, since group names are localized).
  Invoke-Native { icacls $envFile /inheritance:r /grant:r "${Me}:F" '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null } "Proteger .env"
  Remove-Variable tsKey, dbPassword, content
  Write-Ok ".env creado y protegido"
}

# ---------------------------------------------------------------------------------------------------------------------
# 8. GitHub Actions runner on this PC
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Runner de GitHub Actions en este PC"
$runnerName = ("$env:COMPUTERNAME-$Repositorio").ToLower()
if (-not (Test-Path (Join-Path $RunnerDir '.runner'))) {
  New-Item -ItemType Directory -Force -Path $RunnerDir | Out-Null
  $release = gh api repos/actions/runner/releases/latest | ConvertFrom-Json
  $asset = $release.assets | Where-Object { $_.name -like 'actions-runner-win-x64-*.zip' } | Select-Object -First 1
  if (-not $asset) { throw "No se encuentra el runner de Windows en la última versión de actions/runner" }
  $zip = Join-Path $env:TEMP $asset.name
  Write-Host "    Descargando $($asset.name)..."
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip -UseBasicParsing
  # The release notes publish each package's SHA-256: refuse a download that does not match.
  if ($release.body -match '<!-- BEGIN SHA win-x64 -->([0-9a-f]{64})<!-- END SHA win-x64 -->') {
    if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $Matches[1].ToUpper()) { throw "La descarga del runner no coincide con su SHA-256" }
    Write-Ok "SHA-256 verificado"
  }
  Expand-Archive -Path $zip -DestinationPath $RunnerDir -Force
  Remove-Item $zip
  $token = gh api -X POST "repos/$FullName/actions/runners/registration-token" --jq .token
  if ($LASTEXITCODE -ne 0 -or -not $token) { throw "No se pudo pedir el token de registro del runner" }
  Push-Location $RunnerDir
  try {
    Invoke-Native { .\config.cmd --unattended --url "https://github.com/$FullName" --token $token --name $runnerName `
      --labels $RunnerLabel --work _work --replace } "Registrar el runner"
  } finally { Pop-Location }
  Write-Ok "runner $runnerName registrado en $FullName"
} else {
  Write-Ok "el runner ya estaba instalado en $RunnerDir"
}

# A scheduled task at sign-in rather than a Windows service: Docker Desktop runs inside the user's session, and a
# service account could not reach it.
$runCmd = Join-Path $RunnerDir 'run.cmd'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $RunnerDir `
  -Argument "-NoProfile -WindowStyle Hidden -Command `"& '$runCmd'`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $Me
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $Me -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $RunnerTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
if ((Get-ScheduledTask -TaskName $RunnerTask).State -ne 'Running') { Start-ScheduledTask -TaskName $RunnerTask }
Write-Ok "tarea '$RunnerTask' creada: el runner arranca al iniciar sesión"

$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 5
  # Filtered here, not with --jq: PowerShell 5.1 drops the inner quotes a jq string comparison would need.
  $runners = Get-NativeOutput { gh api "repos/$FullName/actions/runners" }
  $status = if ($runners) { ((($runners | Out-String) | ConvertFrom-Json).runners | Where-Object { $_.name -eq $runnerName }).status }
} while ($status -ne 'online' -and (Get-Date) -lt $deadline)
if ($status -ne 'online') { throw "El runner no aparece conectado en GitHub. Mira $RunnerDir\_diag para ver el motivo." }
Write-Ok "runner conectado a GitHub"

# ---------------------------------------------------------------------------------------------------------------------
# 9. Code, first deploy and backups
# ---------------------------------------------------------------------------------------------------------------------
Write-Step "Copiando el código a $FullName"
if (-not $repoIsEmpty) {
  Write-Ok "el repositorio ya tiene código: no se sobrescribe"
} else {
  if (-not $Origen) { throw "El repositorio está vacío: indica de dónde copiar el código con -Origen (fichero .bundle, .zip, carpeta o URL)." }
  $work = Join-Path $env:TEMP "gestion-moldes-$(Get-Random)"
  $ref = 'refs/remotes/origin/main'
  if ($Origen -match '^(https?://|git@)' -or $Origen -like '*.bundle') {
    Invoke-Native { git clone --quiet $Origen $work } "Clonar $Origen"
  } else {
    $folder = $Origen
    if ($Origen -like '*.zip') {
      $folder = Join-Path $env:TEMP "gestion-moldes-zip-$(Get-Random)"
      Expand-Archive -Path $Origen -DestinationPath $folder
      # GitHub's ZIP wraps everything in a "<repo>-<branch>" folder.
      $inner = Get-ChildItem $folder
      if ($inner.Count -eq 1 -and $inner[0].PSIsContainer) { $folder = $inner[0].FullName }
    }
    if (-not (Test-Path (Join-Path $folder 'package.json'))) { throw "$Origen no contiene el código (falta package.json)" }
    if (Test-Path (Join-Path $folder '.git')) {
      Invoke-Native { git clone --quiet $folder $work } "Clonar $folder"
    } else {
      # A ZIP has no history: start one with a single commit.
      Copy-Item $folder $work -Recurse
      $name = gh api user --jq '.name // .login'
      $id = gh api user --jq .id
      Invoke-Native { git -C $work init --quiet --initial-branch main } "git init"
      Invoke-Native { git -C $work add --all } "git add"
      Invoke-Native { git -C $work -c "user.name=$name" -c "user.email=$id+$login@users.noreply.github.com" commit --quiet -m 'Import Gestion de moldes' } "git commit"
      $ref = 'refs/heads/main'
    }
  }
  if (-not (Test-Native { git -C $work rev-parse --verify --quiet $ref })) { throw "El origen no tiene una rama main" }
  Invoke-Native { git -C $work push --quiet "https://github.com/$FullName.git" "${ref}:refs/heads/main" } "Subir el código"
  Remove-Item $work -Recurse -Force
  Write-Ok "código subido a main (eso lanza CI y, si pasa, el despliegue en este PC)"
}

if (-not $SinHerramientasDesarrollo) {
  $devDir = Join-Path $env:USERPROFILE "source\$Repositorio"
  if (-not (Test-Path $devDir)) {
    Invoke-Native { git clone --quiet "https://github.com/$FullName.git" $devDir } "Clonar para desarrollar"
    Write-Ok "copia para desarrollar en $devDir (aparte de la de despliegue)"
  }
}

Write-Step "Esperando al despliegue"
$compose = @('compose', '-f', (Join-Path $AppDir 'docker-compose.prod.yml'), '--env-file', $envFile)
function Test-WebRunning {
  (Test-Path (Join-Path $AppDir 'docker-compose.prod.yml')) -and [bool](Get-NativeOutput { docker @compose ps -q --status running web })
}
$webRunning = Test-WebRunning
if (-not $repoIsEmpty -and -not $webRunning) {
  # Re-run on a repository that already has code but nothing deployed (e.g. the runner was missing): deploy now.
  Invoke-Native { gh workflow run deploy.yml --repo $FullName --ref main } "Lanzar el despliegue"
  Start-Sleep -Seconds 10
}
if (-not $webRunning) {
  Write-Note "Primero pasa CI en GitHub (unos 5 minutos) y luego se construye y arranca aquí (5-15 minutos)."
  Write-Note "Puedes seguirlo en https://github.com/$FullName/actions"
  $deadline = (Get-Date).AddMinutes(45)
  $last = ''
  do {
    Start-Sleep -Seconds 30
    $json = Get-NativeOutput { gh run list --repo $FullName --workflow deploy.yml --limit 1 --json status,conclusion,url }
    $run = if ($json) { @(($json | Out-String) | ConvertFrom-Json) } else { $null }
    $state = if ($run -and $run.Count) { "$($run[0].status) $($run[0].conclusion)".Trim() } else { 'esperando a CI' }
    if ($state -ne $last) { Write-Host "    Despliegue: $state"; $last = $state }
  } while (-not ($run -and $run.Count -and $run[0].status -eq 'completed') -and (Get-Date) -lt $deadline)
  # A run whose job was skipped (CI failed, variables missing) also completes: check the container itself.
  if (-not ($run -and $run.Count -and $run[0].conclusion -eq 'success') -or -not (Test-WebRunning)) {
    $where = if ($run -and $run.Count) { $run[0].url } else { "https://github.com/$FullName/actions" }
    throw "El despliegue no ha terminado bien. Revisa $where y vuelve a ejecutar el script."
  }
}
Write-Ok "la app está en marcha"

Write-Step "Copia de seguridad diaria"
$backupScript = Join-Path $AppDir 'deploy\backup.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -WorkingDirectory $AppDir `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$backupScript`""
$trigger = New-ScheduledTaskTrigger -Daily -At '03:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName $BackupTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Invoke-Native { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript } "Primera copia de seguridad"
Write-Ok "copia diaria a las 03:00 en $AppDir\backups (se guardan las 30 últimas). Cópialas también fuera de este PC."

# ---------------------------------------------------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------------------------------------------------
$dnsName = ''
try {
  $tsStatus = Get-NativeOutput { docker @compose exec -T tailscale tailscale status --json }
  if ($tsStatus) { $dnsName = (($tsStatus | Out-String) | ConvertFrom-Json).Self.DNSName.TrimEnd('.') }
} catch { }
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' -Name $ResumeName -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "================================================================================" -ForegroundColor Green
Write-Host " Todo listo" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Green
if ($dnsName) { Write-Host " Dirección de la app (solo dentro de Tailscale): https://$dnsName" }
else { Write-Host " Dirección de la app: https://$NombreTailscale.<tu-tailnet>.ts.net (mírala en el panel de Tailscale)" }
Write-Host ""
Write-Host " Falta hacer a mano:"
Write-Host "  1. Panel de Tailscale > Machines > '$NombreTailscale' > ... > 'Disable key expiry' (si no, se desconecta a los 180 días)."
Write-Host "  2. En cada móvil: instalar la app Tailscale e iniciar sesión en la misma cuenta, o compartir la máquina"
Write-Host "     '$NombreTailscale' desde el panel (Share) con la cuenta de Tailscale de cada persona."
Write-Host "  3. Abrir la dirección en el móvil, crear el primer usuario y añadirla a la pantalla de inicio."
Write-Host ""
Write-Host " Cada cambio que llegue a main en https://github.com/$FullName se despliega solo en este PC."
Write-Host " Registro de esta instalación: $(Join-Path $Carpeta 'setup.log')"

} catch {
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Corrige lo indicado y vuelve a ejecutar el script: salta lo que ya está hecho." -ForegroundColor Red
} finally {
  Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
  # The elevated window closes on exit: keep it open so the result can be read.
  if (-not $restarting) { Read-Host "Pulsa Enter para cerrar" | Out-Null }
}

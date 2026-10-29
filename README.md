# Fichas técnicas

App web privada, pensada para el móvil, para gestionar **clientes** y sus **fichas técnicas de inyección** (pieza, material, temperaturas, presiones, cotas, tiempos, fuerza de cierre, fotos).

- Clientes: crear, editar, eliminar (con sus fichas) y filtrar por nombre.
- Cada cliente tiene su listado de fichas (p. ej. *Dynamobel* → todas sus fichas, la más reciente arriba).
- Fichas: crear, editar, duplicar (copia los parámetros, no las fotos) y eliminar. Acepta coma decimal (`12,5`). Cada ficha guarda:
  - nombre de la pieza y material;
  - temperaturas del usillo (boquilla y zonas, tantas como tenga la máquina) y temperatura del molde;
  - primera y segunda presión, cambio de cota;
  - carga de material (cota, presión y velocidad) y descompresión;
  - tiempo de enfriamiento y tiempo de retención de la punta;
  - fuerza de cierre del molde; notas.
- Fotos de la pieza desde la cámara o la galería (hasta 20 por ficha). Se reducen en el móvil antes de subirse (~300 KB) y se les quitan los datos de ubicación.
- Búsqueda global en todas las fichas por pieza, material, notas o cliente.
- Usuarios: cada persona entra con su usuario y contraseña; la ficha muestra quién la modificó por última vez.
- Las etiquetas y unidades de los campos están en `src/lib/sheetFields.ts` (cambiar una unidad es una línea).
- Instalable en el móvil ("Añadir a pantalla de inicio"). Modo claro/oscuro automático.

## Seguridad: no es pública

La web **no existe en internet**. Corre en Docker en el PC anfitrión y la única entrada es **Tailscale** (VPN):

- No se abre ningún puerto en el router ni en el PC (los contenedores no publican puertos).
- Tailscale sirve `https://<TS_HOSTNAME>.<tailnet>.ts.net` solo a los dispositivos de la tailnet. **Funnel está desactivado**, así que fuera de la VPN la dirección ni siquiera resuelve.
- Encima, cada persona tiene usuario y contraseña (bloqueo de 15 minutos tras 5 intentos fallidos), por si se pierde un móvil que ya está en la VPN.
- El móvil usa sus datos móviles (o cualquier wifi); no necesita la red de la empresa.

## Puesta en marcha en el PC anfitrión (Windows) — automática

`scripts/setup-host.ps1` deja el PC listo de principio a fin y crea una copia del repositorio en la cuenta de GitHub de
quien aloja la app, con despliegue automático: cada cambio que llega a `main` de esa copia pasa CI en GitHub y se
construye y arranca en el propio PC con Docker. Se puede ejecutar otra vez sin miedo: salta lo que ya está hecho.

Qué hace, en orden:

1. Comprueba Windows (10 22H2 u 11, 64 bits), la virtualización en la BIOS, el espacio en disco y winget.
2. Activa WSL 2 y, si hace falta reiniciar, reinicia y **continúa solo** al volver a iniciar sesión.
3. Instala Git, GitHub CLI, Docker Desktop y, para desarrollar, Node.js LTS, pnpm y VS Code
   (`-SinHerramientasDesarrollo` para omitirlos).
4. Da permiso de Docker al usuario (grupo `docker-users`), arranca Docker Desktop y lo deja arrancando con la sesión.
5. Pregunta si evitar que el PC se suspenda enchufado.
6. Inicia sesión en GitHub (navegador) y crea el repositorio **privado** en esa cuenta.
7. Crea `C:\gestion-moldes\app\.env` con una contraseña de base de datos aleatoria y pide la auth key de Tailscale
   (abre las páginas donde activar MagicDNS + HTTPS y generar la clave). El `.env` solo lo puede leer ese usuario.
8. Instala un **runner de GitHub Actions** en el PC (`C:\gestion-moldes\runner`, comprobando su SHA-256), que arranca
   al iniciar sesión, y guarda las variables `DEPLOY_TARGET` y `DEPLOY_DIR` del repositorio.
9. Sube el código, espera al primer despliegue, programa una copia de seguridad diaria (03:00, se guardan 30) y
   muestra la dirección de la app. Deja otra copia del repositorio en `%USERPROFILE%\source` para desarrollar.

### 1. Quien tiene el código prepara un paquete

El repositorio original es privado, así que quien tenga acceso genera un fichero con todo el historial y se lo pasa
(por USB, Drive, etc.):

```powershell
git clone https://github.com/aechavarris/gestion-moldes.git
cd gestion-moldes
git bundle create ..\gestion-moldes.bundle --all
```

También vale el ZIP de *Code → Download ZIP* (sin historial).

### 2. En el PC anfitrión

Necesita una cuenta de Windows **administradora** y una cuenta de GitHub **activa** (no suspendida). Copia
`scripts\setup-host.ps1` y el paquete al PC y, en PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\setup-host.ps1 -Origen .\gestion-moldes.bundle
```

Opciones: `-Repositorio` (nombre del repositorio nuevo, por defecto `gestion-moldes`), `-Carpeta` (por defecto
`C:\gestion-moldes`), `-NombreTailscale` (por defecto `fichas`). Todo queda registrado en `C:\gestion-moldes\setup.log`.

Al terminar quedan tres cosas a mano, que el script recuerda: desactivar el *key expiry* de la máquina en Tailscale,
meter los móviles en la tailnet (o compartirles la máquina) y crear el primer usuario desde el móvil.

### Cosas a saber

- Docker Desktop y el runner funcionan dentro de la sesión de Windows: tras un reinicio o un corte de luz alguien tiene
  que iniciar sesión (o configurar el inicio de sesión automático con *Autologon* de Microsoft Sysinternals).
- Docker Desktop es gratis para uso personal y para empresas de menos de 250 empleados y 10 M$ de facturación.
- El despliegue se ve en la pestaña *Actions* del repositorio (workflow **Deploy**). Para repetirlo a mano:
  *Actions → Deploy → Run workflow*.
- Si cambia `deploy/tailscale-serve.json`, el despliegue recrea el contenedor de Tailscale (solo lee su configuración
  al arrancar).

## Puesta en marcha manual (sin Actions)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/) y [Git](https://git-scm.com/).

1. **Tailscale**: crea una cuenta en <https://login.tailscale.com> (o usa una existente). En *Settings → Keys* genera una **auth key**. En *DNS* activa **MagicDNS** y **HTTPS Certificates**.
2. Clona el repositorio y crea el `.env`:

   ```powershell
   git clone https://github.com/aechavarris/gestion-moldes.git
   cd gestion-moldes
   Copy-Item deploy\prod.env.example .env
   notepad .env
   ```

   Rellena `POSTGRES_PASSWORD` (cadena larga aleatoria) y `TS_AUTHKEY`.
3. Arranca:

   ```powershell
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. En el panel de Tailscale aparece la máquina `fichas`. Desactiva su **key expiry** para que no se desconecte a los 180 días.
5. **En el móvil**: instala la app de Tailscale, inicia sesión en la misma tailnet (o que el dueño de la tailnet te comparta la máquina `fichas`), abre `https://fichas.<tailnet>.ts.net` y añádela a la pantalla de inicio.
6. **Primer usuario**: la primera vez que se abre la app pide crear un usuario. Después, en *Usuarios y contraseña* (abajo en la lista de clientes) se da de alta a los compañeros.

Docker Desktop debe arrancar con Windows (*Settings → General → Start Docker Desktop when you sign in*) y el PC no debe suspenderse si se quiere acceso a cualquier hora. Los contenedores tienen `restart: unless-stopped`.

Para actualizar: `git pull` y otra vez `docker compose -f docker-compose.prod.yml up -d --build`. Las migraciones de
base de datos se aplican solas (servicio `migrate`) antes de arrancar la web.

## Copias de seguridad

Desde la carpeta de despliegue (`C:\gestion-moldes\app`) o desde el repositorio en la instalación manual:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\backup.ps1
```

Deja `backups\gestion-moldes-<fecha>.dump` (incluye las fotos, que se guardan en la base de datos) y conserva las 30
últimas. La instalación automática ya lo programa a diario; en la manual, prográmalo en el Programador de tareas. Copia
la carpeta `backups` también fuera del PC. Restaurar (sustituye todos los datos actuales):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\restore.ps1 -File backups\gestion-moldes-20261101-0300.dump
```

## Desarrollo

Requisitos: Node 24, pnpm 10, Docker.

```powershell
docker compose up -d postgres
Copy-Item .env.example .env
pnpm install
pnpm db:deploy
pnpm dev
```

Abre <http://localhost:3000>; la primera vez pide crear un usuario. Antes de subir cambios: `pnpm typecheck; pnpm build`.

Stack: Next.js 16 (App Router, server actions), Prisma 7 + PostgreSQL, Tailwind 4, zod.

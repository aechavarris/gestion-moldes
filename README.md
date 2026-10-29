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

## Puesta en marcha en el PC anfitrión (Windows)

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

### Actualizar

```powershell
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Las migraciones de base de datos se aplican solas (servicio `migrate`) antes de arrancar la web.

### Copias de seguridad

```powershell
.\deploy\backup.ps1
```

Deja un `backups\fichas-<fecha>.sql` (incluye las fotos, que se guardan en la base de datos). Conviene programarlo en el Programador de tareas y copiar la carpeta fuera del PC. Restaurar:

```powershell
Get-Content backups\fichas-XXXX.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U fichas fichas
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

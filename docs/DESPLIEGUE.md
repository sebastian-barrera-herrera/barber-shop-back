# Despliegue

Una forma simple y económica: **PostgreSQL administrado + API en un contenedor + web en un contenedor (o Vercel)**,
con HTTPS delante. No hace falta Kubernetes ni microservicios.

## 1. Base de datos

PostgreSQL 16 administrado (Neon, Render, Railway, RDS, Supabase…). Copia la URL de conexión para `DATABASE_URL`.
La extensión `btree_gist` la crea la primera migración (la mayoría de proveedores la permiten).

## 2. API

Construye con [docker/Dockerfile](../docker/Dockerfile). Al arrancar ejecuta `prisma migrate deploy`.

Variables de producción:

```env
NODE_ENV=production
DATABASE_URL=postgresql://…
JWT_ACCESS_SECRET=<nuevo, 48+ bytes>
ENCRYPTION_KEY=<nuevo, 32 bytes base64>     # guárdalo bien: sin él no se pueden leer las llaves de pago
CORS_ORIGINS=https://tudominio.com
WEB_URL=https://tudominio.com
API_PUBLIC_URL=https://api.tudominio.com
COOKIE_SECURE=true
COOKIE_DOMAIN=.tudominio.com                # si web y API están en subdominios del mismo dominio
SWAGGER_ENABLED=false
```

Primera vez: `npx prisma db seed` con `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` para crear el negocio y el dueño
(después cambia nombre, servicios y horarios desde el panel).

**Imágenes subidas:** se guardan en `UPLOADS_DIR` (monta un volumen persistente). Con más de una instancia,
implementa un `StorageProvider` para S3/R2 ([src/modules/uploads/storage.ts](../src/modules/uploads/storage.ts)).

**Proxy:** la API confía en un proxy (`trust proxy`) para ver la IP real en el límite de peticiones.

## 3. Web

Ver el README del front. Variables en tiempo de compilación: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BUSINESS_SLUG`,
`NEXT_PUBLIC_SITE_URL`; opcional en ejecución: `API_URL` (red interna).

## 4. Dominios y cookies

Recomendado: `tudominio.com` (web) y `api.tudominio.com` (API). La cookie de sesión es `SameSite=Lax` y
funciona entre subdominios del mismo sitio. Web y API en dominios distintos (otro sitio) requerirían
cambiar la estrategia de cookie.

## 5. Después de publicar

- Configura Wompi en producción y registra la URL de eventos `https://api.tudominio.com/api/v1/payments/webhooks/wompi`.
- Revisa `https://tudominio.com/sitemap.xml` y regístralo en Google Search Console.
- Respaldos automáticos de la base de datos (casi todos los proveedores lo incluyen).

## Railway (lo que está corriendo hoy)

Proyecto con tres servicios: **Postgres**, **barber-shop-back** y **barber-shop-front**.

- Cada repo trae `railway.json`, que apunta a su `docker/Dockerfile`.
- El backend corre migraciones y datos de ejemplo en el *pre-deploy*:
  `npx prisma migrate deploy && node dist/seed/seed.js && SEED_BUSINESS_SLUG=… node dist/seed/seed-demo.js`
  (los seeds viven en `src/seed/`, así quedan compilados: en producción no hay ts-node).
- Un volumen montado en `/app/uploads` guarda logos y fotos; sin él se pierden en cada despliegue.
- Web y API están en dominios distintos, así que la cookie de sesión necesita
  `COOKIE_SECURE=true` y `COOKIE_SAMESITE=none`, y `CORS_ORIGINS` con el dominio de la web.
- Las variables `NEXT_PUBLIC_*` del front se fijan al compilar: cambiarlas exige un despliegue nuevo.

# AgroMaíz — Guía de implementación del backend

## Arquitectura implementada

```
Frontend (HTML/JS estático)
    ↓ fetch() con JWT en header
Backend (Node.js + Express)    ← lo que está en esta carpeta
    ├── /api/auth        → registro, login, logout, perfil
    ├── /api/cultivos    → CRUD del cultivo del agricultor
    └── /api/clima       → pronóstico (Open-Meteo) + geocodificación
    ↓
PostgreSQL                     ← base de datos ya definida en schema.sql
```

---

## 1. Configurar la base de datos

Abre pgAdmin o la terminal de PostgreSQL y ejecuta:

```bash
# Crear la base de datos (si no existe)
psql -U postgres -c "CREATE DATABASE db_agromaiz;"

# Crear el usuario
psql -U postgres -c "CREATE USER user_dyp WITH PASSWORD '123456';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE db_agromaiz TO user_dyp;"

# Aplicar el esquema
psql -U user_dyp -d db_agromaiz -f db/schema.sql
```

---

## 2. Configurar el .env

El archivo `.env` ya viene listo para desarrollo local. Verifica que los valores coincidan con tu PostgreSQL:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=db_agromaiz
DB_USER=user_dyp
DB_PASSWORD=123456

JWT_SECRET=cambia_esto_por_un_secreto_largo_y_aleatorio

FRONTEND_URL=http://127.0.0.1:5500
```

> **Importante:** Genera un JWT_SECRET seguro con:
> ```bash
> node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
> ```

---

## 3. Instalar dependencias e iniciar

```bash
cd backend
npm install
npm run dev     # desarrollo (con nodemon)
# o
npm start       # producción
```

El servidor queda en: `http://localhost:3000`

Verifica que funciona: `http://localhost:3000/api/health`

---

## 4. Actualizar los archivos del frontend

Copia los 4 archivos de `/agromaiz-frontend/js/` a la carpeta `js/` de tu proyecto:

| Archivo nuevo      | Qué hace                                               |
|--------------------|--------------------------------------------------------|
| `api.js`           | Cliente centralizado: maneja JWT, refresco automático  |
| `login.js`         | Reemplaza el script inline de login.html               |
| `register.js`      | Reemplaza el script inline de register.html            |
| `registrar-cultivo.js` | Wizard con GPS real, geocodificación y clima       |

Luego aplica los cambios en los HTML según el archivo `PARCHES_HTML.md`.

---

## 5. Endpoints disponibles

### Auth (`/api/auth`)
| Método | Ruta         | Auth | Descripción              |
|--------|--------------|------|--------------------------|
| POST   | /register    | No   | Crear cuenta             |
| POST   | /login       | No   | Iniciar sesión           |
| POST   | /refresh     | No   | Renovar access token     |
| POST   | /logout      | No   | Cerrar sesión            |
| GET    | /me          | ✅   | Datos del usuario        |

### Cultivos (`/api/cultivos`)
| Método | Ruta         | Auth | Descripción              |
|--------|--------------|------|--------------------------|
| GET    | /            | ✅   | Cultivo activo           |
| GET    | /todos       | ✅   | Historial de cultivos    |
| POST   | /            | ✅   | Registrar cultivo        |
| PUT    | /:id         | ✅   | Actualizar cultivo       |
| DELETE | /:id         | ✅   | Desactivar cultivo       |

### Clima (`/api/clima`)
| Método | Ruta             | Auth | Descripción              |
|--------|------------------|------|--------------------------|
| GET    | /?lat=X&lon=Y    | ✅   | Pronóstico 7 días        |
| GET    | /geo/reverse     | ✅   | Coords → municipio       |
| GET    | /geo/search?q=   | ✅   | Buscar lugar por nombre  |

---

## 6. Flujo de autenticación en el frontend

```
1. Usuario llena register.html → POST /api/auth/register
   → Servidor devuelve { accessToken, refreshToken, usuario }
   → Frontend guarda en sessionStorage y redirige

2. Usuario llena login.html → POST /api/auth/login
   → Igual que arriba

3. Páginas protegidas: api.js adjunta el token en cada fetch
   → Si el token expira (401 + expirado: true), api.js llama /refresh automáticamente
   → Si el refresh también falla, redirige a login.html

4. Cerrar sesión: Auth.cerrarSesion()
   → Llama POST /logout, limpia sessionStorage, redirige a login.html
```

---

## 7. Geocodificación y clima — cómo funciona

```
Paso 1 del wizard:
  a) GPS automático: navigator.geolocation → /api/clima/geo/reverse → departamento/municipio
  b) Manual: el usuario escribe → /api/clima/geo/search → lista de sugerencias → coords

Paso 3 del wizard:
  → /api/clima?lat=X&lon=Y → Open-Meteo → pronóstico renderizado inline

Al finalizar (Paso 3 → "Finalizar Registro"):
  → POST /api/cultivos con todos los datos incluyendo lat/lon
  → Guarda también en sessionStorage para el asistente de IA
```

---

## 8. Para producción (Railway + Vercel)

**Backend en Railway:**
1. Crear proyecto en railway.app → New Project → Deploy from GitHub
2. Agregar servicio de PostgreSQL en el mismo proyecto
3. Variables de entorno: copiar `.env` y agregar `DATABASE_URL` que Railway genera automáticamente
4. `FRONTEND_URL` = la URL de Vercel (ej: `https://agromaiz.vercel.app`)

**Frontend en Vercel:**
1. Subir la carpeta `agromaiz_chat` a GitHub
2. Importar en vercel.com
3. En `js/api.js`, cambiar: `const API_BASE = 'https://tu-backend.railway.app/api';`

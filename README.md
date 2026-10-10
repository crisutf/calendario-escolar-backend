# ⚙️ Calendario Escolar — Backend

Backend oficial y API del proyecto **Calendario Escolar**, desarrollado con **Node.js**, **Express** para gestionar la lógica, la autenticación y los datos de eventos.

---

## 🛠️ Tecnologías utilizadas

* **Node.js** (v20) — Entorno de ejecución
* **Express** — Framework para el servidor HTTP
* **JWT** — Sistema de autenticación mediante tokens
* **Google OAuth** — Autenticación social / inicio de sesión con Google
* **dotenv** — Gestión segura de variables de entorno

---

## 📋 Prerrequisitos

Antes de empezar, asegúrate de tener instalado:
* [Node.js](https://nodejs.org/) (versión 20 o superior)
* Un gestor de paquetes como **npm** o **yarn**

---

## 📄 Variables de entorno (`.env`)

Crea un archivo llamado `.env` en la raíz del proyecto y configura las siguientes variables:

```dotenv
PORT=9234
NODE_ENV=development

CORS_ORIGIN=https://[TU_FRONTEND_URL],http://localhost:3000

GOOGLE_CLIENT_ID=[TU_GOOGLE_CLIENT_ID].apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=[TU_GOOGLE_CLIENT_SECRET]
GOOGLE_REDIRECT_URI=https://[TU_BACKEND_URL]/api/auth/google

FRONTEND_URL=https://[TU_FRONTEND_URL]

FIRST_ADMIN_EMAIL=admin@crisutf.dev
ROOT_ADMIN_EMAIL=admin@crisutf.dev

ADMIN_SECRET_KEY=D1g1t@l_Crisutf@_

JWT_SECRET=[TU_JWT_SECRET]
```

> 💡 **Nota:** `CORS_ORIGIN` contiene únicamente la URL del frontend y `localhost` para desarrollo. Si necesitas añadir más orígenes, sepáralos con comas.

---

## 🚀 Instalación y ejecución

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/crisutf/calendario-escolar-backend.git
   cd calendario-escolar-backend
   ```

2. **Instalar dependencias:**
   ```bash
   npm install   # o yarn install
   ```

3. **Ejecutar en modo desarrollo:**
   ```bash
   npm run dev   # Arranca el servidor en http://localhost:9234
   ```

---

## 🌐 Endpoints principales de la API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/events` | Obtiene la lista de eventos del calendario. |
| `POST` | `/api/events` | Crea un nuevo evento (requiere autenticación). |
| `GET` | `/api/auth/google` | Inicia el flujo de autenticación OAuth con Google. |
| `GET` | `/api/auth/me` | Obtiene la información del usuario autenticado. |

> 🔍 Consulta la carpeta `src/routes/` para ver el detalle técnico de cada endpoint.

---

## 🤝 Conexión con el Frontend

Este backend se comunica directamente con la aplicación frontend del calendario:

* **Repositorio del frontend:** [calendario-escolar](https://github.com/crisutf/calendario-escolar)

Asegúrate de configurar correctamente los dominios y las URLs en las variables de entorno (`FRONTEND_URL` y `CORS_ORIGIN`) tanto en el backend como en el frontend para evitar problemas de CORS y asegurar que las peticiones fluyan correctamente.

---

## 📄 Licencia

Este proyecto está bajo la licencia **Commons Clause + MIT**. Consulta el archivo `LICENSE` para más detalles.
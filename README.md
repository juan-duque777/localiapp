# Localiapp

Aplicación de pedidos con Node.js y Express. El servidor sirve la tienda y el panel administrativo desde `public/`, expone la API `/api` y guarda los datos de negocio en MySQL.

## Ejecutar localmente

1. Instala Node.js y MySQL.
2. Instala dependencias con `npm install`.
3. Configura las variables `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
4. Ejecuta `npm start`; el servidor usa el puerto `3000` por defecto.
5. Abre `http://localhost:3000/` para la tienda y `http://localhost:3000/admin.html` para el panel.

La base de datos debe tener las tablas `productos`, `mesas`, `pedidos` y `detalle_pedidos` que ya usa la aplicación. La migración de categorías de este repositorio se ejecuta sobre esa base existente.

Para habilitar inicio de sesión, configura `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL` y `JWT_SECRET` en `.env` (consulta [`.env.example`](.env.example)). Crea un cliente OAuth de tipo aplicación web en Google Cloud y autoriza los orígenes locales y de producción de la tienda. `JWT_SECRET` debe ser un secreto aleatorio de al menos 32 caracteres; no lo compartas ni lo incluyas en el repositorio. Usa el mismo cliente de Google en el frontend y el backend: el servidor sirve su Client ID público desde `/api/config`, pero verifica cada credencial Google y decide los permisos de administrador en el servidor.

Todos los usuarios pueden navegar y hacer pedidos como invitados o iniciar sesión con Google. El correo verificado de la cuenta se compara exactamente con `ADMIN_EMAIL` (configúralo tal como Google lo devuelve); solo esa cuenta puede acceder al panel y a las rutas administrativas. Los JWT duran 12 horas.

## Desplegar los cambios

### Categorías

Antes de desplegar el código nuevo, ejecuta una vez [`database/migrations/20261012_add_categories.sql`](database/migrations/20261012_add_categories.sql) contra la base MySQL de Clever Cloud. La migración convierte `productos.categoria` en un campo de texto apto para nuevos identificadores, crea `categorias` y carga las cinco categorías que ya usaba la interfaz (`comidas`, `bebidas`, `panaderia`, `aseo` y `hogar`), de modo que los productos existentes conservan su clasificación.

En Clever Cloud puedes conectarte a la base con las credenciales de la aplicación y ejecutar el contenido de ese archivo desde un cliente MySQL. No reemplaces ni restaures la base de datos para aplicar esta migración: solo crea la tabla y agrega las categorías iniciales. Los productos disponibles cuya categoría no coincida con una categoría registrada también se mantienen visibles en “Todos”; las categorías desactivadas siguen ocultando sus productos.

Después, despliega la aplicación en Render. El panel administrativo permite crear categorías, cambiar su nombre, ocultarlas de la tienda o eliminarlas cuando ya no tengan productos asignados. Ocultar una categoría también oculta sus productos a los clientes, sin borrarlos.

### Inicio de sesión y pedidos

Antes de desplegar la autenticación, ejecuta una vez [`database/migrations/20261111_add_customer_email_to_orders.sql`](database/migrations/20261111_add_customer_email_to_orders.sql) en la base MySQL existente. La columna `pedidos.cliente_email` es nullable para conservar pedidos anteriores y permitir pedidos de invitados. Configura `GOOGLE_CLIENT_ID`, `ADMIN_EMAIL` y un `JWT_SECRET` aleatorio (al menos 32 caracteres) tanto en el `.env` local como en las variables de entorno de Render. Añade a los orígenes autorizados del cliente OAuth el dominio de producción y cada origen local desde el que abrirás el frontend (por ejemplo, `http://localhost:3000`, el origen de XAMPP o el puerto de Live Server). No despliegues el panel hasta haber aplicado la migración y configurado estas tres variables.

### Imágenes en Render

El disco local de Render puede borrarse al reiniciar o volver a desplegar el servicio. La aplicación usa Cloudinary para que las nuevas imágenes se guarden fuera de Render y puedan seguir mostrándose tras esos cambios.

1. Crea una cuenta de Cloudinary y copia los valores **Cloud name**, **API Key** y **API Secret** de su consola.
2. En Render, abre **Environment** en el servicio web y añade las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` con esos valores.
3. Despliega la aplicación. Al cargar una imagen desde el panel, se enviará a la carpeta `localiapp/productos` de Cloudinary y la URL segura quedará guardada en la columna `productos.imagen_url`.

Configura las tres variables juntas; el servidor rechazará una configuración parcial. Si Cloudinary todavía no está configurado en Render, las cargas se desactivan explícitamente en vez de guardarse en el disco efímero. En desarrollo local, si esas variables no están configuradas, se mantiene el almacenamiento local en `public/uploads`.

Las imágenes que Render ya eliminó no se pueden recuperar desde este proyecto. Una vez configuradas las variables y desplegado el cambio, vuelve a subir esas imágenes desde la edición de cada producto. Las URLs de imágenes que aún estén guardadas en la base de datos continúan funcionando.

# Localiapp

Aplicación de pedidos con Node.js y Express. El servidor sirve la tienda y el panel administrativo desde `public/`, expone la API `/api` y guarda los datos de negocio en MySQL.

## Ejecutar localmente

1. Instala Node.js y MySQL.
2. Instala dependencias con `npm install`.
3. Configura las variables `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
4. Ejecuta `npm start`; el servidor usa el puerto `3000` por defecto.
5. Abre `http://localhost:3000/` para la tienda y `http://localhost:3000/admin.html` para el panel.

La base de datos debe tener las tablas `productos`, `mesas`, `pedidos` y `detalle_pedidos` que ya usa la aplicación. La migración de categorías de este repositorio se ejecuta sobre esa base existente.

## Desplegar los cambios

### Categorías

Antes de desplegar el código nuevo, ejecuta una vez [`database/migrations/20261012_add_categories.sql`](database/migrations/20261012_add_categories.sql) contra la base MySQL de Clever Cloud. La migración convierte `productos.categoria` en un campo de texto apto para nuevos identificadores, crea `categorias` y carga las cinco categorías que ya usaba la interfaz (`comidas`, `bebidas`, `panaderia`, `aseo` y `hogar`), de modo que los productos existentes conservan su clasificación.

En Clever Cloud puedes conectarte a la base con las credenciales de la aplicación y ejecutar el contenido de ese archivo desde un cliente MySQL. No reemplaces ni restaures la base de datos para aplicar esta migración: solo crea la tabla y agrega las categorías iniciales.

Después, despliega la aplicación en Render. El panel administrativo permite crear categorías, cambiar su nombre, ocultarlas de la tienda o eliminarlas cuando ya no tengan productos asignados. Ocultar una categoría también oculta sus productos a los clientes, sin borrarlos.

### Imágenes en Render

Render puede reemplazar el sistema de archivos local al reiniciar o volver a desplegar el servicio. Para conservar las imágenes:

1. En la configuración del servicio web de Render, crea y monta un **Persistent Disk** con el punto de montaje `/var/data`.
2. En las variables de entorno del servicio, configura `UPLOAD_DIR=/var/data/uploads`.
3. Despliega la aplicación. El servidor creará la subcarpeta `uploads` y servirá esos archivos desde `/uploads/...`.

La aplicación conserva la ruta local `public/uploads` como valor predeterminado para desarrollo. En Render, las imágenes nuevas solo persistirán si `UPLOAD_DIR` apunta dentro del disco persistente montado. Si el tipo o plan de servicio no permite discos persistentes, se necesita almacenamiento externo de archivos en lugar del disco efímero del servicio.

Las imágenes que ya desaparecieron del disco de Render no pueden recuperarse desde esta aplicación: habrá que volver a cargarlas después de configurar el disco persistente.

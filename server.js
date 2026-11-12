require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { Readable } = require('stream');
const cloudinary = require('cloudinary').v2;
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const fs = require('fs');

const googleClient = new OAuth2Client();
const jwtIssuer = 'localiapp-api';
const jwtAudience = 'localiapp-client';
const jwtLifetime = '12h';

function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    return typeof secret === 'string' && secret.length >= 32 ? secret : null;
}

function verificarToken(req, res, next) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const secret = getJwtSecret();
    if (!secret) return res.status(503).json({ error: 'La autenticación no está configurada' });
    if (!match) return res.status(401).json({ error: 'Autenticación requerida' });

    try {
        const claims = jwt.verify(match[1], secret, {
            algorithms: ['HS256'],
            issuer: jwtIssuer,
            audience: jwtAudience
        });
        if (!claims || typeof claims !== 'object' ||
            typeof claims.email !== 'string' || typeof claims.name !== 'string') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        req.user = claims;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

function verificarAdmin(req, res, next) {
    const adminEmail = process.env.ADMIN_EMAIL || '';
    if (!adminEmail) return res.status(503).json({ error: 'El acceso administrativo no está configurado' });

    verificarToken(req, res, () => {
        if (req.user.email !== adminEmail) {
            return res.status(403).json({ error: 'Acceso denegado: se requieren permisos de administrador' });
        }
        next();
    });
}

function verificarTokenOpcional(req, res, next) {
    if (!req.get('authorization')) return next();
    verificarToken(req, res, next);
}

const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'public', 'uploads'));
const cloudinaryVariables = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const configuredCloudinaryVariables = cloudinaryVariables.filter(name => process.env[name]);
const useCloudinary = configuredCloudinaryVariables.length === cloudinaryVariables.length;

if (configuredCloudinaryVariables.length > 0 && !useCloudinary) {
    throw new Error('Configura CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET juntos.');
}

if (useCloudinary) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
} else if (process.env.RENDER) {
    console.warn('Cloudinary no está configurado; las cargas de imágenes estarán deshabilitadas en Render.');
}

if (!useCloudinary && !process.env.RENDER && !fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: useCloudinary || process.env.RENDER ? multer.memoryStorage() : diskStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Solo se permiten archivos de imagen'));
        }
        cb(null, true);
    }
});

function guardarImagen(file) {
    if (!file) return Promise.resolve(null);
    if (!useCloudinary) {
        if (process.env.RENDER) {
            return Promise.reject(new Error('Configura Cloudinary en Render para habilitar las cargas de imágenes'));
        }
        return Promise.resolve(`/uploads/${file.filename}`);
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'localiapp/productos', resource_type: 'image' },
            (error, result) => {
                if (error) return reject(error);
                if (!result || !result.secure_url) {
                    return reject(new Error('Cloudinary no devolvió la URL de la imagen'));
                }
                resolve(result.secure_url);
            }
        );
        Readable.from([file.buffer]).pipe(stream);
    });
}

const app = express();

// ─── Middlewares ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
if (!useCloudinary) {
    app.use('/uploads', express.static(uploadDir, { fallthrough: false }));
}
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/config', (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

app.post('/api/auth/google', async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const secret = getJwtSecret();
    const credential = req.body && req.body.credential;
    if (!clientId || !secret) {
        return res.status(503).json({ error: 'La autenticación de Google no está configurada' });
    }
    if (typeof credential !== 'string' || credential.length === 0 || credential.length > 10000) {
        return res.status(400).json({ error: 'Credencial de Google inválida' });
    }

    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
            return res.status(401).json({ error: 'La cuenta de Google no está verificada' });
        }

        const user = {
            email: payload.email,
            name: payload.name || payload.email,
            picture: payload.picture || ''
        };
        const token = jwt.sign(user, secret, {
            algorithm: 'HS256',
            expiresIn: jwtLifetime,
            issuer: jwtIssuer,
            audience: jwtAudience,
            subject: payload.sub
        });
        const adminEmail = process.env.ADMIN_EMAIL || '';
        res.json({ token, user, isAdmin: Boolean(adminEmail && user.email === adminEmail) });
    } catch (error) {
        console.error('Error verificando credencial de Google:', error.message);
        res.status(401).json({ error: 'No se pudo verificar la sesión de Google' });
    }
});

app.get('/api/auth/session', verificarToken, (req, res) => {
    const adminEmail = process.env.ADMIN_EMAIL || '';
    res.json({
        user: {
            email: req.user.email,
            name: req.user.name,
            picture: req.user.picture || ''
        },
        isAdmin: Boolean(adminEmail && req.user.email === adminEmail)
    });
});

// ─── Configuración de la Base de Datos ──────────────────────────────
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306
});

db.connect(err => {
    if (err) {
        console.error('Error fatal conectando a la BD:', err);
        return;
    }
    console.log('¡Conexión exitosa a la base de datos de Localiapp!');
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE CATEGORÍAS ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

app.get('/api/categorias', (req, res, next) => {
    if (req.query.admin === 'true') return verificarAdmin(req, res, next);
    next();
}, (req, res) => {
    const isAdmin = req.query.admin === 'true';
    const sql = isAdmin
        ? 'SELECT id, nombre, slug, disponible FROM categorias ORDER BY id'
        : 'SELECT id, nombre, slug, disponible FROM categorias WHERE disponible = 1 ORDER BY id';

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo categorías' });
        res.json(results);
    });
});

app.post('/api/categorias', verificarAdmin, (req, res) => {
    const nombre = req.body && typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const slug = nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80)
        .replace(/-$/g, '');

    if (!nombre || nombre.length > 100 || !slug) {
        return res.status(400).json({ error: 'El nombre debe tener entre 1 y 100 caracteres válidos' });
    }

    db.query(
        'INSERT INTO categorias (nombre, slug, disponible) VALUES (?, ?, 1)',
        [nombre, slug],
        err => {
            if (err && err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Ya existe una categoría con ese nombre o identificador' });
            }
            if (err) return res.status(500).json({ error: 'Error creando categoría' });
            res.status(201).json({ mensaje: 'Categoría creada correctamente', slug });
        }
    );
});

app.put('/api/categorias/:slug', verificarAdmin, (req, res) => {
    const nombre = req.body && typeof req.body.nombre === 'string' ? req.body.nombre.trim() : '';
    const disponible = req.body && req.body.disponible;

    if (!nombre || nombre.length > 100 || ![0, 1, true, false].includes(disponible)) {
        return res.status(400).json({ error: 'Nombre o disponibilidad de categoría inválidos' });
    }

    db.query(
        'UPDATE categorias SET nombre = ?, disponible = ? WHERE slug = ?',
        [nombre, disponible ? 1 : 0, req.params.slug],
        (err, result) => {
            if (err && err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
            }
            if (err) return res.status(500).json({ error: 'Error actualizando categoría' });
            if (result.affectedRows === 0) {
                return db.query(
                    'SELECT id FROM categorias WHERE slug = ?',
                    [req.params.slug],
                    (lookupErr, rows) => {
                        if (lookupErr) return res.status(500).json({ error: 'Error comprobando la categoría' });
                        if (rows.length === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
                        res.json({ mensaje: 'Categoría actualizada correctamente' });
                    }
                );
            }
            res.json({ mensaje: 'Categoría actualizada correctamente' });
        }
    );
});

app.delete('/api/categorias/:slug', verificarAdmin, (req, res) => {
    db.query(
        'SELECT COUNT(*) AS total FROM productos WHERE categoria = ?',
        [req.params.slug],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Error comprobando los productos de la categoría' });
            if (results[0].total > 0) {
                return res.status(409).json({ error: 'No se puede eliminar una categoría que todavía tiene productos asignados' });
            }

            db.query('DELETE FROM categorias WHERE slug = ?', [req.params.slug], (deleteErr, result) => {
                if (deleteErr) return res.status(500).json({ error: 'Error eliminando categoría' });
                if (result.affectedRows === 0) return res.status(404).json({ error: 'Categoría no encontrada' });
                res.json({ mensaje: 'Categoría eliminada correctamente' });
            });
        }
    );
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE PRODUCTOS ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// 1. Obtener todos los productos (Inteligente: admin ve todos, cliente solo disponibles)
app.get('/api/productos', (req, res, next) => {
    const isAdmin = req.query.admin === 'true';
    if (isAdmin) return verificarAdmin(req, res, next);
    next();
}, (req, res) => {
    const isAdmin = req.query.admin === 'true';
    const sql = isAdmin
        ? 'SELECT * FROM productos'
        : `SELECT p.* FROM productos p
           LEFT JOIN categorias c
               ON c.slug COLLATE utf8mb4_general_ci = p.categoria COLLATE utf8mb4_general_ci
           WHERE p.disponible = 1 AND (c.disponible = 1 OR c.slug IS NULL)`;
    
    db.query(sql, (err, results) => {
        if (err && !isAdmin && err.code === 'ER_NO_SUCH_TABLE' && /categorias/i.test(err.message)) {
            console.warn('La tabla categorias no existe; devolviendo productos disponibles sin filtro de categoría.');
            return db.query(
                'SELECT * FROM productos WHERE disponible = 1',
                (fallbackErr, fallbackResults) => {
                    if (fallbackErr) return res.status(500).json({ error: fallbackErr.message });
                    res.json(fallbackResults);
                }
            );
        }
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Crear nuevo producto (Soporta imagen)
app.post('/api/productos', verificarAdmin, upload.single('imagen'), async (req, res) => {
    const { nombre, descripcion, precio, categoria } = req.body;
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    const descripcionLimpia = typeof descripcion === 'string' ? descripcion.trim() : '';
    const categoriaLimpia = typeof categoria === 'string' ? categoria.trim() : '';
    const precioNumerico = typeof precio === 'string' && precio.trim() ? Number(precio) : NaN;
    if (!nombreLimpio || !descripcionLimpia || !categoriaLimpia || !Number.isFinite(precioNumerico) || precioNumerico < 0) {
        return res.status(400).json({ error: 'Nombre, descripción, categoría y precio válido son obligatorios' });
    }

    let imagen_url;
    try {
        imagen_url = await guardarImagen(req.file);
    } catch (err) {
        console.error('Error al guardar imagen del producto:', err);
        return res.status(process.env.RENDER && !useCloudinary ? 503 : 502).json({ error: err.message });
    }
    
    const sql = `INSERT INTO productos (nombre, descripcion, precio, categoria, disponible, imagen_url) VALUES (?, ?, ?, ?, 1, ?)`;
    
    db.query(sql, [nombreLimpio, descripcionLimpia, precioNumerico, categoriaLimpia, imagen_url], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al crear producto' });
        res.status(201).json({ mensaje: 'Producto creado exitosamente' });
    });
});

// 3. Editar producto (Soporta actualización de imagen)
app.put('/api/productos/:id', verificarAdmin, upload.single('imagen'), async (req, res) => {
    const productoId = req.params.id;
    const { nombre, descripcion, precio, categoria } = req.body;
    const nombreLimpio = typeof nombre === 'string' ? nombre.trim() : '';
    const descripcionLimpia = typeof descripcion === 'string' ? descripcion.trim() : '';
    const categoriaLimpia = typeof categoria === 'string' ? categoria.trim() : '';
    const precioNumerico = typeof precio === 'string' && precio.trim() ? Number(precio) : NaN;
    if (!nombreLimpio || !descripcionLimpia || !categoriaLimpia || !Number.isFinite(precioNumerico) || precioNumerico < 0) {
        return res.status(400).json({ error: 'Nombre, descripción, categoría y precio válido son obligatorios' });
    }
    
    let sql = `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria = ? WHERE id = ?`;
    let params = [nombreLimpio, descripcionLimpia, precioNumerico, categoriaLimpia, productoId];
    
    if (req.file) {
        let imagen_url;
        try {
            imagen_url = await guardarImagen(req.file);
        } catch (err) {
            console.error('Error al actualizar imagen del producto:', err);
            return res.status(process.env.RENDER && !useCloudinary ? 503 : 502).json({ error: err.message });
        }
        sql = `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, imagen_url = ? WHERE id = ?`;
        params = [nombreLimpio, descripcionLimpia, precioNumerico, categoriaLimpia, imagen_url, productoId];
    }
    
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al editar producto' });
        res.json({ mensaje: 'Producto actualizado correctamente' });
    });
});

// 4. Cambiar Disponibilidad (Switch On/Off)
app.put('/api/productos/:id/disponibilidad', verificarAdmin, (req, res) => {
    const productoId = req.params.id;
    const { disponible } = req.body; 
    
    const sql = `UPDATE productos SET disponible = ? WHERE id = ?`;
    db.query(sql, [disponible, productoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar disponibilidad' });
        res.json({ mensaje: 'Disponibilidad actualizada' });
    });
});

// 5. Eliminar un producto
app.delete('/api/productos/:id', verificarAdmin, (req, res) => {
    const productoId = req.params.id;
    const sql = `DELETE FROM productos WHERE id = ?`;
    
    db.query(sql, [productoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar el producto' });
        res.json({ mensaje: 'Producto eliminado correctamente' });
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE MESAS ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

app.get('/api/mesas', (req, res, next) => {
    const isAdmin = req.query.admin === 'true';
    if (isAdmin) return verificarAdmin(req, res, next);
    next();
}, (req, res) => {
    const isAdmin = req.query.admin === 'true';
    const sql = isAdmin ? 'SELECT * FROM mesas' : 'SELECT * FROM mesas WHERE disponible = 1';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo mesas' });
        res.json(results);
    });
});

app.post('/api/mesas', verificarAdmin, (req, res) => {
    const { numero } = req.body;
    db.query('INSERT INTO mesas (numero, disponible) VALUES (?, 1)', [numero], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al crear mesa' });
        res.json({ mensaje: 'Mesa creada exitosamente' });
    });
});

app.put('/api/mesas/:id/disponibilidad', verificarAdmin, (req, res) => {
    const { disponible } = req.body;
    db.query('UPDATE mesas SET disponible = ? WHERE id = ?', [disponible, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Error actualizando mesa' });
        res.json({ mensaje: 'Disponibilidad actualizada' });
    });
});

app.delete('/api/mesas/:id', verificarAdmin, (req, res) => {
    db.query('DELETE FROM mesas WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Error eliminando mesa' });
        res.json({ mensaje: 'Mesa eliminada' });
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE MIS PEDIDOS (CLIENTE) ─────────────────────────────────
// ════════════════════════════════════════════════════════════════════
app.get('/api/mis-pedidos', verificarToken, (req, res) => {
    const sql = 'SELECT * FROM pedidos WHERE cliente_email = ? ORDER BY id DESC LIMIT 10';
    
    db.query(sql, [req.user.email], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo pedidos' });
        if (results.length === 0) return res.json([]);
        
        const pedidosIds = results.map(p => p.id);
        const sqlDetalle = 'SELECT * FROM detalle_pedidos WHERE pedido_id IN (?)';
        
        db.query(sqlDetalle, [pedidosIds], (err2, detalles) => {
            if (err2) return res.json(results); // Devuelve sin detalles si hay error
            
            const pedidosConDetalle = results.map(p => {
                p.productos = detalles.filter(d => d.pedido_id === p.id);
                return p;
            });
            res.json(pedidosConDetalle);
        });
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE PEDIDOS (CON FILTRO DE TIEMPO) ────────────────────────
// ════════════════════════════════════════════════════════════════════

app.get('/api/pedidos', verificarAdmin, (req, res) => {
    // Leemos qué filtro pide el admin, por defecto 'todos'
    const filtro = req.query.filtro || 'todos';
    let condicionFecha = '1=1'; // Significa "traer todo" por defecto

    // Traducimos el filtro a comandos SQL
    if (filtro === 'hoy') condicionFecha = 'DATE(fecha) = CURDATE()';
    if (filtro === 'semana') condicionFecha = 'YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1)';
    if (filtro === 'mes') condicionFecha = 'MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())';

    const sqlPedidos = `SELECT * FROM pedidos WHERE ${condicionFecha} ORDER BY fecha ASC, id ASC`;
    
    db.query(sqlPedidos, (err, pedidos) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo pedidos' });
        if (pedidos.length === 0) return res.json([]); 

        const sqlDetalles = `SELECT * FROM detalle_pedidos`;
        db.query(sqlDetalles, (err2, detalles) => {
            if (err2) return res.status(500).json({ error: 'Error obteniendo detalles' });

            const pedidosCompletos = pedidos.map(p => {
                p.productos = detalles.filter(d => d.pedido_id === p.id);
                return p;
            });
            res.json(pedidosCompletos);
        });
    });
});

// 2. Guardar un nuevo pedido (Viene desde el carrito del cliente)
app.post('/api/pedidos', verificarTokenOpcional, (req, res) => {
    // NUEVO: Recibimos tipo_pedido y mesa
    const { cliente, direccion, hora_entrega, metodo_pago, notas, total, productos, tipo_pedido, mesa } = req.body;
    const clienteLimpio = req.user
        ? req.user.name.trim()
        : (typeof cliente === 'string' ? cliente.trim() : '');
    const clienteEmail = req.user ? req.user.email : null;
    const direccionLimpia = typeof direccion === 'string' ? direccion.trim() : '';
    const horaEntregaLimpia = typeof hora_entrega === 'string' ? hora_entrega.trim() : '';
    const metodoPagoLimpio = typeof metodo_pago === 'string' ? metodo_pago.trim() : '';
    const notasLimpias = typeof notas === 'string' ? notas.trim() : '';
    const tipoPedidoLimpio = typeof tipo_pedido === 'string' ? tipo_pedido.trim() : '';
    const mesaLimpia = typeof mesa === 'string' || typeof mesa === 'number' ? String(mesa).trim() : '';
    const numeroSeguro = valor =>
        typeof valor === 'number' || (typeof valor === 'string' && valor.trim() !== '')
            ? Number(valor)
            : NaN;
    const totalNumerico = numeroSeguro(total);
    if (!clienteLimpio || !horaEntregaLimpia || !metodoPagoLimpio ||
        !['Domicilio', 'En mesa'].includes(tipoPedidoLimpio) ||
        (tipoPedidoLimpio === 'Domicilio' && !direccionLimpia) ||
        (tipoPedidoLimpio === 'En mesa' && !mesaLimpia) ||
        !Number.isFinite(totalNumerico) || totalNumerico < 0 ||
        !Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({ error: 'Completa los datos obligatorios del pedido' });
    }

    const productosLimpios = productos.map(producto => {
        const id = numeroSeguro(producto && producto.id);
        const nombre = typeof (producto && producto.nombre) === 'string' ? producto.nombre.trim() : '';
        const cantidad = numeroSeguro(producto && producto.cantidad);
        const subtotal = numeroSeguro(producto && producto.subtotal);
        return { id, nombre, cantidad, subtotal };
    });
    if (productosLimpios.some(producto =>
        !Number.isInteger(producto.id) || producto.id <= 0 ||
        !producto.nombre ||
        !Number.isInteger(producto.cantidad) || producto.cantidad <= 0 ||
        !Number.isFinite(producto.subtotal) || producto.subtotal < 0
    )) {
        return res.status(400).json({ error: 'El detalle del pedido contiene productos inválidos' });
    }

    const sqlPedido = `INSERT INTO pedidos (cliente, cliente_email, direccion, hora_entrega, metodo_pago, notas, total, tipo_pedido, mesa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const datosPedido = [
        clienteLimpio,
        clienteEmail,
        tipoPedidoLimpio === 'En mesa' ? 'Consumo en el local' : direccionLimpia,
        horaEntregaLimpia,
        metodoPagoLimpio,
        notasLimpias,
        totalNumerico,
        tipoPedidoLimpio,
        tipoPedidoLimpio === 'En mesa' ? mesaLimpia : null
    ];
    db.query(sqlPedido, datosPedido, (pedidoError, result) => {
        if (pedidoError) return res.status(500).json({ error: 'Error al procesar el pedido principal' });

        const pedidoId = result.insertId;
        const valoresDetalle = productosLimpios.map(producto => [
            pedidoId, producto.id, producto.nombre, producto.cantidad, producto.subtotal
        ]);
        const sqlDetalle = `INSERT INTO detalle_pedidos (pedido_id, producto_id, nombre_producto, cantidad, subtotal) VALUES ?`;
        db.query(sqlDetalle, [valoresDetalle], detalleError => {
            if (detalleError) {
                return db.query('DELETE FROM pedidos WHERE id = ?', [pedidoId], cleanupError => {
                    if (cleanupError) console.error('Error limpiando pedido sin detalle:', cleanupError);
                    res.status(500).json({ error: 'Error al guardar el detalle del pedido' });
                });
            }
            res.status(201).json({ mensaje: '¡Pedido guardado con éxito!', pedido_id: pedidoId });
        });
    });
});

// 3. Actualizar el estado de un pedido (Botones Preparar/Entregar)
app.put('/api/pedidos/:id/estado', verificarAdmin, (req, res) => {
    const pedidoId = Number(req.params.id);
    const { estado } = req.body;
    if (!Number.isInteger(pedidoId) || pedidoId <= 0 || !['Pendiente', 'Preparando', 'Entregado'].includes(estado)) {
        return res.status(400).json({ error: 'Pedido o estado inválido' });
    }

    const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
    db.query(sql, [estado, pedidoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error actualizando estado' });
        if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
        res.json({ mensaje: 'Estado actualizado correctamente' });
    });
});

// 4. Consultar el estado de un pedido específico (Para el cliente)
app.get('/api/pedidos/:id', (req, res) => {
    const sql = `SELECT estado FROM pedidos WHERE id = ?`;
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error consultando el estado del pedido' });
        if (result.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
        res.json(result[0]);
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE REPORTES Y VENTAS ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

app.get('/api/reportes', verificarAdmin, (req, res) => {
    const filtro = req.query.filtro || 'todos';
    
    // Condición para la tabla pedidos normal
    let condicionFecha = '1=1'; 
    if (filtro === 'hoy') condicionFecha = 'DATE(fecha) = CURDATE()';
    if (filtro === 'semana') condicionFecha = 'YEARWEEK(fecha, 1) = YEARWEEK(CURDATE(), 1)';
    if (filtro === 'mes') condicionFecha = 'MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())';

    const sqlTotales = `
        SELECT 
            COUNT(id) as total_pedidos, 
            SUM(total) as ingresos_totales 
        FROM pedidos 
        WHERE estado = 'Entregado' AND ${condicionFecha}
    `;
    
    db.query(sqlTotales, (err, resultTotales) => {
        if (err) return res.status(500).json({ error: 'Error calculando totales' });

        // Adaptamos la condición para la tabla unida (con el alias "p.")
        let condicionFechaAlias = condicionFecha.replace(/fecha/g, 'p.fecha');

        const sqlTop = `
            SELECT 
                dp.nombre_producto, 
                SUM(dp.cantidad) as total_vendido 
            FROM detalle_pedidos dp 
            JOIN pedidos p ON dp.pedido_id = p.id 
            WHERE p.estado = 'Entregado' AND ${condicionFechaAlias}
            GROUP BY dp.nombre_producto 
            ORDER BY total_vendido DESC 
            LIMIT 5
        `;
        
        db.query(sqlTop, (err2, resultTop) => {
            if (err2) return res.status(500).json({ error: 'Error calculando top de productos' });
            
            res.json({
                totales: resultTotales[0],
                topProductos: resultTop
            });
        });
    });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err instanceof multer.MulterError) {
        const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({
            error: err.code === 'LIMIT_FILE_SIZE'
                ? 'La imagen no puede superar los 5 MB'
                : 'No se pudo procesar el archivo de imagen'
        });
    }
    if (err.message === 'Solo se permiten archivos de imagen') {
        return res.status(400).json({ error: err.message });
    }
    console.error('Error procesando solicitud:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Iniciar Servidor ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});
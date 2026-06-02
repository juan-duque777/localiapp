require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// ─── Configuración de Multer (Imágenes) ─────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

const app = express();

// ─── Middlewares ────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
// ─── RUTAS DE PRODUCTOS ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// 1. Obtener todos los productos (Inteligente: admin ve todos, cliente solo disponibles)
app.get('/api/productos', (req, res) => {
    const isAdmin = req.query.admin === 'true';
    const sql = isAdmin ? 'SELECT * FROM productos' : 'SELECT * FROM productos WHERE disponible = 1';
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// 2. Crear nuevo producto (Soporta imagen)
app.post('/api/productos', upload.single('imagen'), (req, res) => {
    const { nombre, descripcion, precio, categoria } = req.body;
    const imagen_url = req.file ? `/uploads/${req.file.filename}` : null;
    
    const sql = `INSERT INTO productos (nombre, descripcion, precio, categoria, disponible, imagen_url) VALUES (?, ?, ?, ?, 1, ?)`;
    
    db.query(sql, [nombre, descripcion, precio, categoria, imagen_url], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al crear producto' });
        res.status(201).json({ mensaje: 'Producto creado exitosamente' });
    });
});

// 3. Editar producto (Soporta actualización de imagen)
app.put('/api/productos/:id', upload.single('imagen'), (req, res) => {
    const productoId = req.params.id;
    const { nombre, descripcion, precio, categoria } = req.body;
    
    let sql = `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria = ? WHERE id = ?`;
    let params = [nombre, descripcion, precio, categoria, productoId];
    
    if (req.file) {
        const imagen_url = `/uploads/${req.file.filename}`;
        sql = `UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, imagen_url = ? WHERE id = ?`;
        params = [nombre, descripcion, precio, categoria, imagen_url, productoId];
    }
    
    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al editar producto' });
        res.json({ mensaje: 'Producto actualizado correctamente' });
    });
});

// 4. Cambiar Disponibilidad (Switch On/Off)
app.put('/api/productos/:id/disponibilidad', (req, res) => {
    const productoId = req.params.id;
    const { disponible } = req.body; 
    
    const sql = `UPDATE productos SET disponible = ? WHERE id = ?`;
    db.query(sql, [disponible, productoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al actualizar disponibilidad' });
        res.json({ mensaje: 'Disponibilidad actualizada' });
    });
});

// 5. Eliminar un producto
app.delete('/api/productos/:id', (req, res) => {
    const productoId = req.params.id;
    const sql = `DELETE FROM productos WHERE id = ?`;
    
    db.query(sql, [productoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al eliminar el producto' });
        res.json({ mensaje: 'Producto eliminado correctamente' });
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE PEDIDOS ───────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

// 1. Obtener todos los pedidos (Para el admin)
app.get('/api/pedidos', (req, res) => {
    const sql = `SELECT * FROM pedidos ORDER BY fecha DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo pedidos' });
        res.json(results);
    });
});

// 2. Guardar un nuevo pedido (Viene desde el carrito del cliente)
app.post('/api/pedidos', (req, res) => {
    const { cliente, direccion, hora_entrega, metodo_pago, notas, total, productos } = req.body;
    
    const sqlPedido = `INSERT INTO pedidos (cliente, direccion, hora_entrega, metodo_pago, notas, total) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sqlPedido, [cliente, direccion, hora_entrega, metodo_pago, notas, total], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error al procesar el pedido principal' });

        const pedidoId = result.insertId; 
        const sqlDetalle = `INSERT INTO detalle_pedidos (pedido_id, producto_id, nombre_producto, cantidad, subtotal) VALUES ?`;
        const valoresDetalle = productos.map(p => [pedidoId, p.id, p.nombre, p.cantidad, p.subtotal]);

        db.query(sqlDetalle, [valoresDetalle], (err2, result2) => {
            if (err2) return res.status(500).json({ error: 'Error al guardar el detalle del pedido' });
            res.status(200).json({ mensaje: '¡Pedido guardado con éxito!', pedido_id: pedidoId });
        });
    });
});

// 3. Actualizar el estado de un pedido (Botones Preparar/Entregar)
app.put('/api/pedidos/:id/estado', (req, res) => {
    const pedidoId = req.params.id;
    const { estado } = req.body;

    const sql = `UPDATE pedidos SET estado = ? WHERE id = ?`;
    db.query(sql, [estado, pedidoId], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error actualizando estado' });
        res.json({ mensaje: 'Estado actualizado correctamente' });
    });
});

// 4. Consultar el estado de un pedido específico (Para el cliente)
app.get('/api/pedidos/:id', (req, res) => {
    const sql = `SELECT estado FROM pedidos WHERE id = ?`;
    db.query(sql, [req.params.id], (err, result) => {
        if (err || result.length === 0) return res.status(404).json({ error: 'Pedido no encontrado' });
        res.json(result[0]);
    });
});

// ════════════════════════════════════════════════════════════════════
// ─── RUTAS DE REPORTES Y VENTAS ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

app.get('/api/reportes', (req, res) => {
    // 1. Calculamos la plata total y cuántos pedidos se han entregado
    const sqlTotales = `
        SELECT 
            COUNT(id) as total_pedidos, 
            SUM(total) as ingresos_totales 
        FROM pedidos 
        WHERE estado = 'Entregado'
    `;
    
    db.query(sqlTotales, (err, resultTotales) => {
        if (err) return res.status(500).json({ error: 'Error calculando totales' });

        // 2. Calculamos cuáles son los 5 productos que más se venden
        const sqlTop = `
            SELECT 
                dp.nombre_producto, 
                SUM(dp.cantidad) as total_vendido 
            FROM detalle_pedidos dp 
            JOIN pedidos p ON dp.pedido_id = p.id 
            WHERE p.estado = 'Entregado' 
            GROUP BY dp.nombre_producto 
            ORDER BY total_vendido DESC 
            LIMIT 5
        `;
        
        db.query(sqlTop, (err2, resultTop) => {
            if (err2) return res.status(500).json({ error: 'Error calculando top de productos' });
            
            // Mandamos el paquete completo al frontend
            res.json({
                totales: resultTotales[0],
                topProductos: resultTop
            });
        });
    });
});

// ─── Iniciar Servidor ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en http://localhost:${PORT}`);
});
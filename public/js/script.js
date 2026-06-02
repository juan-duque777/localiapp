// ─── Variables Globales ───────────────────────────────────────────────
let baseDeDatosLocal = [];
const cart = {}; // { productId: { product, qty } }
let currentCat = 'todos';
let currentQuery = '';

// ─── Utilidades ─────────────────────────────────────────────────────
const fmt = n => '$' + n.toLocaleString('es-CO');
const $ = id => document.getElementById(id);

function totalItems() {
    return Object.values(cart).reduce((s, i) => s + i.qty, 0);
}

function totalPrice() {
    return Object.values(cart).reduce((s, i) => s + i.product.price * i.qty, 0);
}

// ─── Conexión al Backend (Clever Cloud) ──────────────────────────────
async function cargarProductosDesdeBD() {
    try {
        const respuesta = await fetch('http://localhost:3000/api/productos');
        if (!respuesta.ok) throw new Error('Error en el servidor');

        const productosMySQL = await respuesta.json();

        // Convertimos los datos de la BD al formato que pide tu diseño
        baseDeDatosLocal = productosMySQL.map(prod => {
            // Asignamos un emoji automático según la categoría
            let icono = '📦';
            if(prod.categoria === 'comidas') icono = '🍔';
            if(prod.categoria === 'bebidas') icono = '🥤';
            if(prod.categoria === 'panaderia') icono = '🍞';
            if(prod.categoria === 'aseo') icono = '🧴';
            if(prod.categoria === 'hogar') icono = '🏠';

            return {
                id: prod.id,
                name: prod.nombre,
                desc: prod.descripcion,
                price: parseFloat(prod.precio),
                cat: prod.categoria || 'todos',
                emoji: icono,
                imagen_url: prod.imagen_url // <-- Agregamos esta línea
            };
        });

        // Pintamos los productos en la pantalla
        renderProducts(currentCat, currentQuery);

    } catch (error) {
        console.error('Error cargando menú:', error);
        $('contenedor-productos').innerHTML = 
            '<div style="text-align:center; padding:2rem; color:var(--text-light);"><p>No se pudo conectar con el local.</p></div>';
    }
}

// ─── Actualizar carrito flotante ────────────────────────────────────
function updateCart() {
    const count = totalItems();
    const total = totalPrice();

    $('cart-bubble').textContent = count;
    $('cart-total').textContent  = fmt(total);

    const fc = $('floating-cart');
    if (count > 0) {
        fc.classList.add('visible');
    } else {
        fc.classList.remove('visible');
    }
}

// ─── Renderizar la fila de precio/qty de una tarjeta ────────────────
function renderPriceRow(productId) {
    const priceRow = document.querySelector(`.price-row[data-id="${productId}"]`);
    if (!priceRow) return;

    const item = cart[productId];
    priceRow.innerHTML = item
        ? `<span class="price">${fmt(baseDeDatosLocal.find(p=>p.id===productId).price)}</span>
           <div class="qty-controls">
               <button class="qty-btn" onclick="changeQty(${productId}, -1)" aria-label="Quitar uno">−</button>
               <span class="qty-num">${item.qty}</span>
               <button class="qty-btn" onclick="changeQty(${productId}, 1)" aria-label="Agregar uno">+</button>
           </div>`
        : `<span class="price">${fmt(baseDeDatosLocal.find(p=>p.id===productId).price)}</span>
           <button class="add-btn" onclick="addToCart(${productId})" aria-label="Agregar al carrito">+</button>`;
}

// ─── Agregar al carrito ──────────────────────────────────────────────
function addToCart(productId) {
    const product = baseDeDatosLocal.find(p => p.id === productId);
    if (!product) return;

    if (cart[productId]) {
        cart[productId].qty++;
    } else {
        cart[productId] = { product, qty: 1 };
    }

    renderPriceRow(productId);
    updateCart();
}

// ─── Cambiar cantidad ────────────────────────────────────────────────
function changeQty(productId, delta) {
    if (!cart[productId]) return;

    cart[productId].qty += delta;

    if (cart[productId].qty <= 0) {
        delete cart[productId];
    }

    renderPriceRow(productId);
    updateCart();
}

// ─── Construir tarjeta de producto ──────────────────────────────────
function buildCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.cat = product.cat;
    card.dataset.name = product.name.toLowerCase();

    // Verificamos si existe la foto guardada en el backend
        const medioVisual = product.imagen_url 
        ? `<img src="http://localhost:3000${product.imagen_url}" alt="${product.name}" style="width:100%; height:100%; object-fit:cover;">`
        : `<div class="product-img-placeholder">${product.emoji}</div>`;

    card.innerHTML = `
        <div class="product-img-wrap">
            ${medioVisual}
        </div>
        <div class="product-info">
            <div>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-desc">${product.desc}</p>
            </div>
            <div class="price-row" data-id="${product.id}">
                <span class="price">${fmt(product.price)}</span>
                <button class="add-btn" onclick="addToCart(${product.id})" aria-label="Agregar ${product.name} al carrito">+</button>
            </div>
        </div>
    `;

    return card;
}

// ─── Renderizar lista de productos ───────────────────────────────────
function renderProducts(filter = 'todos', query = '') {
    const container = $('contenedor-productos');
    if (!container) return;
    container.innerHTML = '';

    const filtered = baseDeDatosLocal.filter(p => {
        const matchCat  = filter === 'todos' || p.cat === filter;
        const matchName = p.name.toLowerCase().includes(query.toLowerCase());
        return matchCat && matchName;
    });

    const countEl = $('product-count');
    if (countEl) {
        countEl.textContent = filtered.length
            ? `${filtered.length} producto${filtered.length > 1 ? 's' : ''}`
            : '';
    }

    if (!filtered.length) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-regular fa-face-sad-tear" style="font-size: 2rem; color: var(--text-light);"></i>
                <p style="margin-top: 10px;">No encontramos productos aquí</p>
            </div>`;
        return;
    }

    filtered.forEach(p => {
        container.appendChild(buildCard(p));
        // Si ya hay items en el carrito, restaurar los botones de cantidad
        if (cart[p.id]) renderPriceRow(p.id);
    });
}

// ─── Eventos de Interfaz ─────────────────────────────────────────────
document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCat = btn.dataset.cat;

        const titles = {
            todos: 'Lo más pedido', comidas: '🍔 Comidas',
            bebidas: '🥤 Bebidas', panaderia: '🍞 Panadería',
            aseo: '🧴 Aseo', hogar: '🏠 Hogar'
        };
        const titleEl = $('section-title');
        if(titleEl) titleEl.textContent = titles[currentCat] || 'Productos';
        
        renderProducts(currentCat, currentQuery);
    });
});
// Activar el primer filtro al cargar
const searchInput = $('search-input');
if(searchInput) {
    searchInput.addEventListener('input', e => {
        currentQuery = e.target.value;
        renderProducts(currentCat, currentQuery);
    });
}

// ══════════════════════════════════════════════════════════════════════
// ─── LÓGICA DEL MODAL DE CHECKOUT Y FORMULARIO ────────────────────────
// ══════════════════════════════════════════════════════════════════════

// 1. Variables del Modal y Nuevas Funciones
const checkoutModal = $('checkout-modal');
const closeModalBtn = $('close-modal');
const checkoutItemsContainer = $('checkout-items');
const checkoutTotalPrice = $('checkout-total-price');
const checkoutForm = $('checkout-form');
const googleLoginBtn = $('google-login-btn');
const authSection = $('auth-section');
const deliverySection = $('delivery-section');
const getLocationBtn = $('get-location-btn');
const clientAddressInput = $('client-address');
const orderTimeType = $('order-time-type');
const customTimeInput = $('custom-time');

// 2. Abrir el Modal y renderizar la factura
function openCheckoutModal() {
    if (!checkoutItemsContainer) return;
    checkoutItemsContainer.innerHTML = ''; 
    
    Object.values(cart).forEach(item => {
        const div = document.createElement('div');
        div.className = 'checkout-item';
        div.innerHTML = `
            <div class="item-details">
                <h4>${item.qty}x ${item.product.name}</h4>
                <p>${fmt(item.product.price)} c/u</p>
            </div>
            <div class="item-price">${fmt(item.product.price * item.qty)}</div>
        `;
        checkoutItemsContainer.appendChild(div);
    });

    checkoutTotalPrice.textContent = fmt(totalPrice());
    checkoutModal.classList.add('active');
    document.body.style.overflow = 'hidden'; 
}

// 3. Cerrar el Modal
function closeCheckoutModal() {
    checkoutModal.classList.remove('active');
    document.body.style.overflow = '';
    checkoutForm.reset();
}

if(closeModalBtn) closeModalBtn.addEventListener('click', closeCheckoutModal);
if(checkoutModal) checkoutModal.addEventListener('click', e => {
    if (e.target === checkoutModal) closeCheckoutModal(); 
});

// 4. Conectar el carrito flotante para que abra el modal
const floatingCart = $('floating-cart');
if(floatingCart) {
    floatingCart.addEventListener('click', openCheckoutModal);
    floatingCart.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openCheckoutModal();
    });
}

// 5. Simulación de Login con Google (Oculta login, muestra formulario)
if(googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        googleLoginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        setTimeout(() => {
            authSection.style.display = 'none';
            deliverySection.style.display = 'block';
        }, 800);
    });
}

// 6. Lógica del Botón GPS
if(getLocationBtn) {
    getLocationBtn.addEventListener('click', () => {
        if ("geolocation" in navigator) {
            clientAddressInput.value = "Buscando ubicación...";
            getLocationBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            
            navigator.geolocation.getCurrentPosition((position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                clientAddressInput.value = `📍 Ubicación GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                getLocationBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
            }, (error) => {
                alert("No pudimos acceder a tu GPS. Por favor escribe tu dirección.");
                clientAddressInput.value = "";
                getLocationBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            });
        } else {
            alert("Tu navegador no soporta GPS.");
        }
    });
}

// 7. Mostrar el reloj solo si elige "Elegir hora exacta"
if(orderTimeType) {
    orderTimeType.addEventListener('change', (e) => {
        if(e.target.value === 'Elegir hora') {
            customTimeInput.style.display = 'block';
            customTimeInput.setAttribute('required', 'true');
        } else {
            customTimeInput.style.display = 'none';
            customTimeInput.removeAttribute('required');
        }
    });
}

// 9. ENVIAR EL PEDIDO A LA BASE DE DATOS
if(checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();

        let horaFinal = orderTimeType.value;
        if(horaFinal === 'Elegir hora') {
            horaFinal = customTimeInput.value;
        }

        const pedidoFinal = {
            cliente: "Usuario de Google", 
            direccion: clientAddressInput.value,
            hora_entrega: horaFinal,
            metodo_pago: $('payment-method').value,
            notas: $('order-notes').value,
            total: totalPrice(),
            productos: Object.values(cart).map(item => ({
                id: item.product.id,
                nombre: item.product.name,
                cantidad: item.qty,
                subtotal: item.product.price * item.qty
            }))
        };

        // Cambiamos el texto del botón mientras carga
        const btnSubmit = document.querySelector('.submit-order-btn');
        const textoOriginal = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btnSubmit.disabled = true;

        // Mandamos el paquete por el tubo (Fetch) a nuestra nueva ruta
// Mandamos el paquete por el tubo (Fetch) a nuestra nueva ruta
        fetch('http://localhost:3000/api/pedidos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoFinal)
        })
        .then(response => response.json())
        .then(data => {
            // 1. PRIMERO cerramos el modal para limpiar la pantalla
            closeCheckoutModal();

            // 1.5. GUARDAMOS EL TICKET EN EL CELULAR PARA EL RADAR DE NOTIFICACIONES 
            localStorage.setItem('localiapp_ticket', data.pedido_id);
            localStorage.setItem('localiapp_estado', 'Pendiente');
            
            // 2. Vaciamos el carrito de una vez para evitar re-envíos
            for (let prop in cart) delete cart[prop];
            updateCart();
            renderProducts(currentCat, currentQuery);

            // 3. AHORA mostramos el éxito sobre la pantalla limpia
            Swal.fire({
                title: '¡Pedido Confirmado!',
                html: `
                    <div style="text-align: center; font-family: 'Nunito', sans-serif;">
                        <p style="margin-bottom: 10px; font-size: 1rem;">Tu orden ha sido recibida y enviada al local exitosamente.</p>
                        <div style="background: #E4F5F7; border: 1px solid rgba(61,158,171,0.2); padding: 10px; border-radius: 10px; margin-bottom: 15px; display: inline-block;">
                            <span style="color: #2d8a96; font-weight: 800; font-size: 1.1rem;">Ticket de orden: #${data.pedido_id}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: #6B5E57;">El negocio ya está revisando tu pedido y pronto comenzará a prepararlo según tus indicaciones. ¡Gracias por usar Localiapp!</p>
                    </div>
                `,
                icon: 'success',
                confirmButtonColor: '#3D9EAB', // Cambiado a Teal para verse más corporativo
                confirmButtonText: 'Entendido',
                background: '#FFF9F2',
                color: '#2A1F1A',
                width: '400px', // Un poco más ancho para que el texto respire
                customClass: {
                    popup: 'swal-premium-popup'
                }
            });
        })
        .catch(error => {
            console.error('Error de conexión:', error);
            // SweetAlert para el error también
            Swal.fire({
                title: 'Uy, algo falló',
                text: 'Hubo un problema de conexión al enviar tu pedido. Intenta de nuevo.',
                icon: 'error',
                confirmButtonColor: '#3D9EAB', // Tu color teal
                background: '#FFF9F2',
                color: '#2A1F1A'
            });
        })
        .finally(() => {
            // Restauramos el botón original
            btnSubmit.innerHTML = textoOriginal;
            btnSubmit.disabled = false;
        });
    });
}

// ══════════════════════════════════════════════════════════════════════
// ─── LÓGICA DE MENÚS FLOTANTES (HEADER) ───────────────────────────────
// ══════════════════════════════════════════════════════════════════════

const bellBtn = $('bell-btn');
const notifDropdown = $('notif-dropdown');
const userBtn = $('user-btn');
const userDropdown = $('user-dropdown');

// Función para cerrar todos los dropdowns (y que no se amontonen abiertos)
function closeAllDropdowns() {
    if(notifDropdown) notifDropdown.classList.remove('active');
    if(userDropdown) userDropdown.classList.remove('active');
}

// Abrir/Cerrar Notificaciones
if(bellBtn) {
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Evita que el clic cierre inmediatamente el cuadro
        const isActive = notifDropdown.classList.contains('active');
        closeAllDropdowns();
        if(!isActive) notifDropdown.classList.add('active');
    });
}

// Abrir/Cerrar Usuario
if(userBtn) {
    userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = userDropdown.classList.contains('active');
        closeAllDropdowns();
        if(!isActive) userDropdown.classList.add('active');
    });
}

// Cerrar si el cliente hace clic en cualquier parte vacía de la página
document.addEventListener('click', (e) => {
    if (notifDropdown && !notifDropdown.contains(e.target)) {
        notifDropdown.classList.remove('active');
    }
    if (userDropdown && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('active');
    }
});

// ─── SIMULACIÓN DE INICIO DE SESIÓN EN EL HEADER ─────────────────────
const btnLoginHeader = $('btn-login-header');
const btnLogoutHeader = $('btn-logout-header');
const viewUnlogged = $('view-unlogged');
const viewLogged = $('view-logged');

if(btnLoginHeader) {
    btnLoginHeader.addEventListener('click', () => {
        // Animación temporal para simular que carga Google
        btnLoginHeader.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        
        setTimeout(() => {
            // Cambiamos a la vista donde se ve el correo y el link de Admin
            viewUnlogged.style.display = 'none';
            viewLogged.style.display = 'block';
            btnLoginHeader.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" style="width: 16px;"> Continuar con Google';
            
            // Un SweetAlert de bienvenida súper elegante
            Swal.fire({
                title: '¡Sesión Iniciada!',
                text: 'Bienvenido de nuevo, Juan.',
                icon: 'success',
                confirmButtonColor: '#3D9EAB',
                timer: 2000,
                showConfirmButton: false,
                background: '#FFF9F2',
                color: '#2A1F1A'
            });
        }, 1000);
    });
}

if(btnLogoutHeader) {
    btnLogoutHeader.addEventListener('click', (e) => {
        e.preventDefault();
        // Devolvemos el menú a su estado original (botón de Google)
        viewLogged.style.display = 'none';
        viewUnlogged.style.display = 'block';
        userDropdown.classList.remove('active');
    });
}

// ─── LÓGICA DE NOTIFICACIONES REALES (RADAR DEL CLIENTE) ──────────────
const dropdownList = document.querySelector('.dropdown-list');
const badge = $('notif-badge');
let notificacionesNoLeidas = 0;

function agregarNotificacion(titulo, mensaje, colorClass, icono) {
    if(!dropdownList) return;
    
    // Sumamos al circulito rojo
    notificacionesNoLeidas++;
    badge.textContent = notificacionesNoLeidas;
    badge.style.display = 'flex';

    // Creamos la nueva notificación arriba de la lista
    const li = document.createElement('li');
    li.innerHTML = `
        <div class="icon-circle ${colorClass}"><i class="${icono}"></i></div>
        <div>
            <p class="notif-title">${titulo}</p>
            <p class="notif-desc">${mensaje}</p>
        </div>
    `;
    dropdownList.prepend(li); // Lo pone de primero

    // Toast flotante para que el usuario lo vea de una
    Swal.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: titulo, text: mensaje,
        showConfirmButton: false, timer: 4000
    });
}

// Al abrir el menú de notificaciones, borramos el número rojo
if(bellBtn) {
    bellBtn.addEventListener('click', () => {
        notificacionesNoLeidas = 0;
        badge.style.display = 'none';
    });
}

// Radar automático: Vigilar mi pedido cada 5 segundos
setInterval(async () => {
    const miTicket = localStorage.getItem('localiapp_ticket');
    const miEstadoViejo = localStorage.getItem('localiapp_estado');
    
    if(!miTicket) return; // Si no ha comprado nada, no hace nada

    try {
        const res = await fetch(`http://localhost:3000/api/pedidos/${miTicket}`);
        if (!res.ok) return;
        const data = await res.json();
        
        // Si el estado en la base de datos es diferente al que tenía guardado...
        if(data.estado && data.estado !== miEstadoViejo) {
            localStorage.setItem('localiapp_estado', data.estado); // Actualizo la memoria
            
            if(data.estado === 'Preparando') {
                agregarNotificacion(
                    `Ticket #${miTicket} en el horno 🔥`, 
                    'El restaurante ya empezó a preparar tu pedido.', 
                    'bg-coral', 'fa-solid fa-fire-burner'
                );
            } else if(data.estado === 'Entregado') {
                agregarNotificacion(
                    `¡Tu pedido va en camino! 🛵`, 
                    'El domiciliario ya salió con el Ticket #' + miTicket, 
                    'bg-teal', 'fa-solid fa-motorcycle'
                );
                // Como ya se entregó, borramos el ticket de la memoria para que deje de vigilar
                localStorage.removeItem('localiapp_ticket');
            }
        }
    } catch(e) { console.log('Buscando actualizaciones...'); }
}, 5000);

// ─── Iniciar Aplicación ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', cargarProductosDesdeBD);
// ─── MAGIA: Autodetecta el entorno (Local o Render) ───────────────────
const API_URL = window.location.hostname.includes('onrender.com') ? '' : 'http://localhost:3000';

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

// ─── Conexión al Backend ─────────────────────────────────────────────
async function cargarProductosDesdeBD() {
    try {
        const respuesta = await fetch(`${API_URL}/api/productos`);
        if (!respuesta.ok) throw new Error('Error en el servidor');

        const productosMySQL = await respuesta.json();

        // Convertimos los datos de la BD al formato que pide tu diseño
        baseDeDatosLocal = productosMySQL.map(prod => {
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
                imagen_url: prod.imagen_url 
            };
        });

        // Pintamos los productos en la pantalla
        renderProducts(currentCat, currentQuery);

    } catch (error) {
        console.error('Error cargando menú:', error);
        const container = $('contenedor-productos');
        if(container) {
            container.innerHTML = 
                '<div style="text-align:center; padding:2rem; color:var(--warm-3);"><p>No se pudo conectar con el local.</p></div>';
        }
    }
}

// ─── Actualizar carrito flotante ────────────────────────────────────
function updateCart() {
    const count = totalItems();
    const total = totalPrice();

    $('cart-bubble').textContent = count;
    $('cart-total').textContent  = fmt(total);

    const fc = $('floating-cart');
    if(fc) {
        if (count > 0) {
            fc.classList.add('visible');
        } else {
            fc.classList.remove('visible');
        }
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

// --- LÓGICA DE MESAS ---
async function cargarMesasCliente() {
    const selectMesa = document.getElementById('select-mesa');
    if(!selectMesa) return;
    try {
        const res = await fetch(`${API_URL}/api/mesas`);
        const mesas = await res.json();
        selectMesa.innerHTML = '<option value="" disabled selected>Selecciona tu mesa...</option>';
        mesas.forEach(m => {
            selectMesa.innerHTML += `<option value="${m.numero}">Mesa ${m.numero}</option>`;
        });
    } catch(e) { console.log('Error cargando mesas'); }
}

function setTipoPedido(tipo) {
    document.getElementById('tipo_pedido_val').value = tipo;
    const btnDom = document.getElementById('btn-domicilio');
    const btnMesa = document.getElementById('btn-mesa');

    if (tipo === 'Domicilio') {
        btnDom.className = 'btn btn-primary';
        btnMesa.className = 'btn btn-outline';
        document.getElementById('campos-domicilio').style.display = 'block';
        document.getElementById('campos-mesa').style.display = 'none';
        
        // Hacer requerida la dirección
        document.getElementById('client-address').setAttribute('required', 'true');
        document.getElementById('select-mesa').removeAttribute('required');
    } else {
        btnDom.className = 'btn btn-outline';
        btnMesa.className = 'btn btn-primary';
        document.getElementById('campos-domicilio').style.display = 'none';
        document.getElementById('campos-mesa').style.display = 'block';
        
        // Hacer requerida la mesa
        document.getElementById('client-address').removeAttribute('required');
        document.getElementById('select-mesa').setAttribute('required', 'true');
        
        cargarMesasCliente(); 
    }
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

    const medioVisual = product.imagen_url 
        ? `<img src="${API_URL}${product.imagen_url}" alt="${product.name}" style="width:100%; height:100%; object-fit:cover;">`
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
                <i class="fa-regular fa-face-sad-tear" style="font-size: 2rem; color: var(--warm-3);"></i>
                <p style="margin-top: 10px;">No encontramos productos aquí</p>
            </div>`;
        return;
    }

    filtered.forEach(p => {
        container.appendChild(buildCard(p));
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

function closeCheckoutModal() {
    checkoutModal.classList.remove('active');
    document.body.style.overflow = '';
    if(checkoutForm) checkoutForm.reset();
}

if(closeModalBtn) closeModalBtn.addEventListener('click', closeCheckoutModal);
if(checkoutModal) checkoutModal.addEventListener('click', e => {
    if (e.target === checkoutModal) closeCheckoutModal(); 
});

const floatingCart = $('floating-cart');
if(floatingCart) {
    floatingCart.addEventListener('click', openCheckoutModal);
    floatingCart.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openCheckoutModal();
    });
}

if(googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
        googleLoginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        setTimeout(() => {
            authSection.style.display = 'none';
            deliverySection.style.display = 'block';
        }, 800);
    });
}

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

if(checkoutForm) {
    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();

        let horaFinal = orderTimeType.value;
        if(horaFinal === 'Elegir hora') {
            horaFinal = customTimeInput.value;
        }

        const tipoPedido = document.getElementById('tipo_pedido_val').value;
        const numeroMesa = tipoPedido === 'En mesa' ? document.getElementById('select-mesa').value : null;

        if (tipoPedido === 'En mesa' && !numeroMesa) {
            Swal.fire('Falta la mesa', 'Por favor selecciona en qué mesa estás.', 'warning');
            return;
        }

        const pedidoFinal = {
            cliente: "Usuario de Google", 
            direccion: tipoPedido === 'Domicilio' ? clientAddressInput.value : 'Consumo en el local',
            hora_entrega: horaFinal,
            metodo_pago: $('payment-method').value,
            notas: $('order-notes').value,
            total: totalPrice(),
            tipo_pedido: tipoPedido,
            mesa: numeroMesa,
            productos: Object.values(cart).map(item => ({
                id: item.product.id,
                nombre: item.product.name,
                cantidad: item.qty,
                subtotal: item.product.price * item.qty
            }))
        };

        const btnSubmit = document.querySelector('.submit-order-btn');
        const textoOriginal = btnSubmit.innerHTML;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btnSubmit.disabled = true;

        fetch(`${API_URL}/api/pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoFinal)
        })
        .then(response => response.json())
        .then(data => {
            closeCheckoutModal();

            localStorage.setItem('localiapp_ticket', data.pedido_id);
            localStorage.setItem('localiapp_estado', 'Pendiente');
            
            for (let prop in cart) delete cart[prop];
            updateCart();
            renderProducts(currentCat, currentQuery);

            Swal.fire({
                title: '¡Pedido Confirmado!',
                html: `
                    <div style="text-align: center; font-family: 'Nunito', sans-serif;">
                        <p style="margin-bottom: 10px; font-size: 1rem;">Tu orden ha sido recibida y enviada al local exitosamente.</p>
                        <div style="background: #E4F5F7; border: 1px solid rgba(61,158,171,0.2); padding: 10px; border-radius: 10px; margin-bottom: 15px; display: inline-block;">
                            <span style="color: #2d8a96; font-weight: 800; font-size: 1.1rem;">Ticket de orden: #${data.pedido_id}</span>
                        </div>
                        <p style="font-size: 0.85rem; color: #6B5E57;">El negocio ya está revisando tu pedido y pronto comenzará a prepararlo. ¡Gracias por usar Localiapp!</p>
                    </div>
                `,
                icon: 'success',
                confirmButtonColor: '#3D9EAB',
                confirmButtonText: 'Entendido',
                background: '#FFF9F2',
                color: '#2A1F1A'
            });
        })
        .catch(error => {
            console.error('Error de conexión:', error);
            Swal.fire({
                title: 'Uy, algo falló',
                text: 'Hubo un problema de conexión al enviar tu pedido. Intenta de nuevo.',
                icon: 'error',
                confirmButtonColor: '#3D9EAB',
                background: '#FFF9F2',
                color: '#2A1F1A'
            });
        })
        .finally(() => {
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

function closeAllDropdowns() {
    if(notifDropdown) notifDropdown.classList.remove('active');
    if(userDropdown) userDropdown.classList.remove('active');
}

if(bellBtn) {
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = notifDropdown.classList.contains('active');
        closeAllDropdowns();
        if(!isActive) notifDropdown.classList.add('active');
    });
}

if(userBtn) {
    userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = userDropdown.classList.contains('active');
        closeAllDropdowns();
        if(!isActive) userDropdown.classList.add('active');
    });
}

document.addEventListener('click', (e) => {
    if (notifDropdown && !notifDropdown.contains(e.target)) {
        notifDropdown.classList.remove('active');
    }
    if (userDropdown && !userDropdown.contains(e.target)) {
        userDropdown.classList.remove('active');
    }
});

const btnLoginHeader = $('btn-login-header');
const btnLogoutHeader = $('btn-logout-header');
const viewUnlogged = $('view-unlogged');
const viewLogged = $('view-logged');

if(btnLoginHeader) {
    btnLoginHeader.addEventListener('click', () => {
        btnLoginHeader.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        
        setTimeout(() => {
            viewUnlogged.style.display = 'none';
            viewLogged.style.display = 'block';
            btnLoginHeader.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" style="width: 16px;"> Continuar con Google';
            
            Swal.fire({
                title: '¡Sesión Iniciada!',
                text: 'Bienvenido de nuevo.',
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
    
    notificacionesNoLeidas++;
    badge.textContent = notificacionesNoLeidas;
    badge.style.display = 'flex';

    const li = document.createElement('li');
    li.innerHTML = `
        <div class="icon-circle ${colorClass}"><i class="${icono}"></i></div>
        <div>
            <p class="notif-title">${titulo}</p>
            <p class="notif-desc">${mensaje}</p>
        </div>
    `;
    dropdownList.prepend(li); 

    Swal.fire({
        toast: true, position: 'top-end', icon: 'success',
        title: titulo, text: mensaje,
        showConfirmButton: false, timer: 4000
    });
}

if(bellBtn) {
    bellBtn.addEventListener('click', () => {
        notificacionesNoLeidas = 0;
        badge.style.display = 'none';
    });
}

setInterval(async () => {
    const miTicket = localStorage.getItem('localiapp_ticket');
    const miEstadoViejo = localStorage.getItem('localiapp_estado');
    
    if(!miTicket) return; 

    try {
        const res = await fetch(`${API_URL}/api/pedidos/${miTicket}`);
        if (!res.ok) return;
        const data = await res.json();
        
        if(data.estado && data.estado !== miEstadoViejo) {
            localStorage.setItem('localiapp_estado', data.estado); 
            
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
                localStorage.removeItem('localiapp_ticket');
            }
        }
    } catch(e) { console.log('Buscando actualizaciones...'); }
}, 5000);

// ─── Iniciar Aplicación ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', cargarProductosDesdeBD);
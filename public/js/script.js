// Usa el backend local solo durante desarrollo; en producción, comparte el origen.
const isLocalHost = ['', 'localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
const API_URL = isLocalHost && window.location.port !== '3000' ? 'http://localhost:3000' : '';

// ─── Variables Globales ───────────────────────────────────────────────
let baseDeDatosLocal = [];
let categoriasDisponibles = [];
const cart = {}; // { productId: { product, qty } }
let currentCat = 'todos';
let currentQuery = '';

// ─── Utilidades ─────────────────────────────────────────────────────
const fmt = n => '$' + n.toLocaleString('es-CO');
const $ = id => document.getElementById(id);
const imageUrl = url => /^https?:\/\//i.test(url) ? url : `${API_URL}${url}`;
const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
let errorRadarNotificado = false;
let consultandoEstadoPedido = false;
let authToken = localStorage.getItem('localiapp_jwt') || '';
let authUser = null;

try {
    authUser = JSON.parse(localStorage.getItem('localiapp_user') || 'null');
} catch (error) {
    localStorage.removeItem('localiapp_user');
}

function fetchConTimeout(url, opciones = {}, tiempo = 10000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), tiempo);
    const headers = new Headers(opciones.headers || {});
    if (authToken) headers.set('Authorization', 'Bearer ' + authToken);
    return fetch(url, { ...opciones, headers, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

const iconosCategoria = {
    comidas: '🍔',
    bebidas: '🥤',
    panaderia: '🍞',
    aseo: '🧴',
    hogar: '🏠'
};

function renderCategoryButtons() {
    const nav = document.querySelector('.categories');
    if (!nav) return;

    nav.querySelectorAll('.cat-btn:not([data-cat="todos"])').forEach(button => button.remove());
    categoriasDisponibles.forEach(categoria => {
        const button = document.createElement('button');
        button.className = 'cat-btn';
        button.dataset.cat = categoria.slug;

        const icon = document.createElement('span');
        icon.className = 'cat-em';
        icon.textContent = iconosCategoria[categoria.slug] || '🛍️';
        button.append(icon, document.createTextNode(` ${categoria.nombre}`));
        button.addEventListener('click', () => seleccionarCategoria(button));
        nav.appendChild(button);
    });

    const allButton = nav.querySelector('[data-cat="todos"]');
    if (allButton) allButton.addEventListener('click', () => seleccionarCategoria(allButton));
}

function seleccionarCategoria(button) {
    document.querySelectorAll('.cat-btn').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    currentCat = button.dataset.cat;

    const categoria = categoriasDisponibles.find(item => item.slug === currentCat);
    $('section-title').textContent = currentCat === 'todos'
        ? 'Lo más pedido'
        : `${iconosCategoria[currentCat] || '🛍️'} ${categoria ? categoria.nombre : 'Productos'}`;
    renderProducts(currentCat, currentQuery);
}

async function cargarCategoriasCliente() {
    const response = await fetchConTimeout(`${API_URL}/api/categorias`);
    if (!response.ok) {
        const detalle = await response.text();
        throw new Error(`No se pudieron cargar las categorías (HTTP ${response.status}): ${detalle}`);
    }
    categoriasDisponibles = await response.json();
    renderCategoryButtons();
}

function totalItems() {
    return Object.values(cart).reduce((s, i) => s + i.qty, 0);
}

function totalPrice() {
    return Object.values(cart).reduce((s, i) => s + i.product.price * i.qty, 0);
}

// ─── Conexión al Backend ─────────────────────────────────────────────
async function cargarProductosDesdeBD() {
    try {
        const respuesta = await fetchConTimeout(`${API_URL}/api/productos`);
        if (!respuesta.ok) {
            const detalle = await respuesta.text();
            throw new Error(`No se pudieron cargar los productos (HTTP ${respuesta.status}): ${detalle}`);
        }

        const productosMySQL = await respuesta.json();

        // Convertimos los datos de la BD al formato que pide tu diseño
        baseDeDatosLocal = productosMySQL.map(prod => {
            const icono = iconosCategoria[prod.categoria] || '📦';

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
                '<div style="text-align:center; padding:2rem; color:var(--warm-3);"><p>No se pudieron cargar los productos. Intenta de nuevo más tarde.</p></div>';
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
        const res = await fetchConTimeout(`${API_URL}/api/mesas`);
        if (!res.ok) throw new Error('Error cargando mesas');
        const mesas = await res.json();
        selectMesa.innerHTML = '<option value="" disabled selected>Selecciona tu mesa...</option>';
        mesas.forEach(m => {
            const option = document.createElement('option');
            option.value = m.numero;
            option.textContent = `Mesa ${m.numero}`;
            selectMesa.appendChild(option);
        });
    } catch(error) {
        selectMesa.innerHTML = '<option value="" disabled selected>No se pudieron cargar las mesas</option>';
    }
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
        ? `<img src="${escapeHtml(imageUrl(product.imagen_url))}" alt="${escapeHtml(product.name)}" style="width:100%; height:100%; object-fit:cover;">`
        : `<div class="product-img-placeholder">${product.emoji}</div>`;

    card.innerHTML = `
        <div class="product-img-wrap">
            ${medioVisual}
        </div>
        <div class="product-info">
            <div>
                <h3 class="product-name">${escapeHtml(product.name)}</h3>
                <p class="product-desc">${escapeHtml(product.desc)}</p>
            </div>
            <div class="price-row" data-id="${product.id}">
                <span class="price">${fmt(product.price)}</span>
                <button class="add-btn" onclick="addToCart(${product.id})" aria-label="Agregar ${escapeHtml(product.name)} al carrito">+</button>
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
const continueAsGuestBtn = $('continue-as-guest');
const clientNameInput = $('client-name');
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
                <h4>${escapeHtml(item.qty)}x ${escapeHtml(item.product.name)}</h4>
                <p>${fmt(item.product.price)} c/u</p>
            </div>
            <div class="item-price">${fmt(item.product.price * item.qty)}</div>
        `;
        checkoutItemsContainer.appendChild(div);
    });

    checkoutTotalPrice.textContent = fmt(totalPrice());
    if (authUser) {
        authSection.style.display = 'none';
        deliverySection.style.display = 'block';
        clientNameInput.value = authUser.name;
    } else {
        authSection.style.display = 'block';
        deliverySection.style.display = 'none';
    }
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

if (continueAsGuestBtn) {
    continueAsGuestBtn.addEventListener('click', () => {
        authSection.style.display = 'none';
        deliverySection.style.display = 'block';
        clientNameInput.value = '';
        clientNameInput.focus();
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
        const nombreCliente = authUser ? authUser.name : clientNameInput.value.trim();

        if (!nombreCliente) {
            Swal.fire('Falta tu nombre', 'Escribe tu nombre para identificar el pedido.', 'warning');
            return;
        }

        if (tipoPedido === 'En mesa' && !numeroMesa) {
            Swal.fire('Falta la mesa', 'Por favor selecciona en qué mesa estás.', 'warning');
            return;
        }

        const pedidoFinal = {
            cliente: nombreCliente,
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

        fetchConTimeout(`${API_URL}/api/pedidos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pedidoFinal)
        }, 30000)
        .then(async response => {
            const data = await response.json();
            if (!response.ok || !data.pedido_id) {
                throw new Error(data.error || 'No se pudo confirmar el pedido');
            }
            return data;
        })
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
const adminPanelLink = $('admin-panel-link');

function actualizarInterfazSesion(user, esAdmin = false) {
    authUser = user;
    viewUnlogged.style.display = user ? 'none' : 'block';
    viewLogged.style.display = user ? 'block' : 'none';
    adminPanelLink.style.display = user && esAdmin ? 'flex' : 'none';
    if (!user) return;

    $('user-profile-name').textContent = user.name || 'Usuario';
    $('user-profile-email').textContent = user.email || '';
    const picture = $('user-profile-picture');
    picture.src = user.picture || '';
    picture.alt = user.name ? `Foto de ${user.name}` : 'Foto de perfil';
    if (clientNameInput) clientNameInput.value = user.name || '';
    if (authSection) authSection.style.display = 'none';
    if (deliverySection) deliverySection.style.display = 'block';
}

function cerrarSesionCliente(event) {
    if (event) event.preventDefault();
    authToken = '';
    authUser = null;
    localStorage.removeItem('localiapp_jwt');
    localStorage.removeItem('localiapp_user');
    actualizarInterfazSesion(null);
    if (authSection) authSection.style.display = 'block';
    if (deliverySection) deliverySection.style.display = 'none';
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
    if (userDropdown) userDropdown.classList.remove('active');
}

async function esperarGoogleIdentity() {
    for (let intento = 0; intento < 100; intento++) {
        if (window.google && google.accounts && google.accounts.id) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('No se pudo cargar Google Identity Services');
}

async function completarLoginGoogle(response) {
    try {
        const res = await fetchConTimeout(`${API_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión con Google');
        authToken = data.token;
        localStorage.setItem('localiapp_jwt', authToken);
        localStorage.setItem('localiapp_user', JSON.stringify(data.user));
        actualizarInterfazSesion(data.user, data.isAdmin);
        authSection.style.display = 'none';
        deliverySection.style.display = 'block';
        Swal.fire({
            toast: true, position: 'top-end', icon: 'success',
            title: `Sesión iniciada como ${data.user.name}`,
            showConfirmButton: false, timer: 2500
        });
    } catch (error) {
        console.error('Error iniciando sesión con Google:', error);
        Swal.fire('No se pudo iniciar sesión', error.message || 'Intenta de nuevo.', 'error');
    }
}

async function configurarInicioGoogle() {
    try {
        const configResponse = await fetchConTimeout(`${API_URL}/api/config`);
        if (!configResponse.ok) throw new Error('No se pudo cargar la configuración de autenticación');
        const config = await configResponse.json();
        if (!config.googleClientId) throw new Error('El inicio de sesión con Google no está configurado');
        await esperarGoogleIdentity();
        google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: completarLoginGoogle,
            auto_select: false
        });
        if (btnLoginHeader) {
            google.accounts.id.renderButton(btnLoginHeader, { type: 'standard', theme: 'outline', size: 'medium', text: 'continue_with', shape: 'pill', width: 250 });
        }
        if (googleLoginBtn) {
            google.accounts.id.renderButton(googleLoginBtn, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'pill', width: 320 });
        }
    } catch (error) {
        console.error('Error configurando Google Identity Services:', error);
        Swal.fire('Inicio de sesión no disponible', 'No se pudo cargar la autenticación de Google.', 'error');
    }
}

async function restaurarSesionCliente() {
    if (!authToken) {
        actualizarInterfazSesion(null);
        return;
    }
    try {
        const response = await fetchConTimeout(`${API_URL}/api/auth/session`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Sesión inválida');
        localStorage.setItem('localiapp_user', JSON.stringify(data.user));
        actualizarInterfazSesion(data.user, data.isAdmin);
    } catch (error) {
        console.error('Error verificando sesión:', error);
        authToken = '';
        localStorage.removeItem('localiapp_jwt');
        localStorage.removeItem('localiapp_user');
        actualizarInterfazSesion(null);
    }
}

if(btnLogoutHeader) {
    btnLogoutHeader.addEventListener('click', cerrarSesionCliente);
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
    
    if (!miTicket || consultandoEstadoPedido) return;
    consultandoEstadoPedido = true;

    try {
        const res = await fetchConTimeout(`${API_URL}/api/pedidos/${miTicket}`, {}, 8000);
        if (!res.ok) throw new Error('No se pudo consultar el estado del pedido');
        const data = await res.json();
        errorRadarNotificado = false;
        
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
    } catch(error) {
        if (!errorRadarNotificado) {
            errorRadarNotificado = true;
            Swal.fire({
                toast: true, position: 'top-end', icon: 'warning',
                title: 'No se pudo consultar el estado del pedido',
                text: 'Seguiremos intentando actualizarlo.',
                showConfirmButton: false, timer: 5000
            });
        }
    } finally {
        consultandoEstadoPedido = false;
    }
}, 5000);

// ══════════════════════════════════════════════════════════════════════
// ─── LÓGICA DE "MIS PEDIDOS" ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════
const misPedidosModal = $('mis-pedidos-modal');
const closeMisPedidosBtn = $('close-mis-pedidos');
const btnMisPedidos = $('btn-mis-pedidos');
const misPedidosContainer = $('mis-pedidos-container');

if(btnMisPedidos) {
    btnMisPedidos.addEventListener('click', (e) => {
        e.preventDefault();
        closeAllDropdowns(); // Escondemos el menú flotante
        abrirMisPedidos();
    });
}

if(closeMisPedidosBtn) {
    closeMisPedidosBtn.addEventListener('click', () => {
        misPedidosModal.classList.remove('active');
        document.body.style.overflow = '';
    });
}

// Cerrar tocando afuera
if(misPedidosModal) {
    misPedidosModal.addEventListener('click', e => {
        if (e.target === misPedidosModal) {
            misPedidosModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
}

async function abrirMisPedidos() {
    misPedidosModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    
    if(misPedidosContainer) {
        misPedidosContainer.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--teal);"></i></div>';
    }
    
    try {
        const res = await fetchConTimeout(`${API_URL}/api/mis-pedidos`);
        if (!res.ok) throw new Error('Error consultando los pedidos');
        const pedidos = await res.json();
        
        misPedidosContainer.innerHTML = '';
        
        if(pedidos.length === 0) {
            misPedidosContainer.innerHTML = `
                <div style="text-align: center; padding: 30px 10px; color: var(--warm-3);">
                    <i class="fa-solid fa-receipt" style="font-size: 3rem; margin-bottom: 15px; color: #eee;"></i>
                    <p>Aún no has hecho ningún pedido.</p>
                </div>`;
            return;
        }
        
        pedidos.forEach(p => {
            let badgeClass = 'status-pendiente';
            let iconClass = 'fa-clock';
            
            if(p.estado === 'Preparando') { badgeClass = 'status-preparando'; iconClass = 'fa-fire-burner'; }
            if(p.estado === 'Entregado') { badgeClass = 'status-entregado'; iconClass = 'fa-check-double'; }
            
            let detalleTexto = p.productos ? p.productos.map(prod => `<strong>${escapeHtml(prod.cantidad)}x</strong> ${escapeHtml(prod.nombre_producto)}`).join(', ') : 'Varios productos...';
            
            const card = document.createElement('div');
            card.style.cssText = 'background: white; border: 1px solid #eee; border-radius: 12px; padding: 15px; margin-bottom: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.02);';
            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed #eee; padding-bottom: 10px;">
                    <span style="font-weight: 800; color: var(--warm-1); font-size: 1.1rem;">Ticket #${p.id}</span>
                    <span class="status-badge ${badgeClass}" style="font-size: 0.75rem;"><i class="fa-solid ${iconClass}"></i> ${escapeHtml(p.estado || 'Pendiente')}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--warm-2); margin-bottom: 12px; line-height: 1.5;">
                    <p style="margin: 0 0 5px 0;"><i class="fa-regular fa-calendar"></i> ${escapeHtml(p.hora_entrega)} • ${p.tipo_pedido === 'Domicilio' ? '🛵 Domicilio' : '🍽️ Mesa'}</p>
                    <p style="margin: 0; color: var(--teal);">${detalleTexto}</p>
                </div>
                <div style="font-weight: 900; font-size: 1.2rem; color: var(--warm-1); text-align: left;">
                    ${fmt(p.total)}
                </div>
            `;
            misPedidosContainer.appendChild(card);
        });
    } catch(e) {
        misPedidosContainer.innerHTML = '<p style="text-align:center; color: var(--coral); padding: 20px;">No se pudieron cargar los pedidos.</p>';
    }
}
// ─── Iniciar Aplicación ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    configurarInicioGoogle();
    restaurarSesionCliente();
    try {
        await cargarCategoriasCliente();
    } catch (error) {
        console.error('Error cargando categorías:', error);
        Swal.fire({
            toast: true, position: 'top-end', icon: 'warning',
            title: 'No se pudieron cargar las categorías',
            showConfirmButton: false, timer: 5000
        });
    }
    await cargarProductosDesdeBD();
});
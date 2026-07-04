
document.addEventListener("DOMContentLoaded", init);

/* =========================================================
   1) CONFIGURACIÓN — lo único que tenés que tocar en el código
   ========================================================= */
// Reemplazá esto por la URL que te da SheetDB cuando conectás tu Google Sheet.
// Ejemplo: "https://sheetdb.io/api/v1/abc123xyz"
const SHEETDB_URL = "https://sheetdb.io/api/v1/hsc4qoycmeuyk";

// Se usa solo si la hoja "Config" no tiene la fila numeroWhatsapp
const NUMERO_WHATSAPP_DEFAULT = "5491100000000";

const PRODUCTOS_POR_PAGINA = 6;

/* =========================================================
   2) ESTADO
   ========================================================= */
let productosData = [];
let config = {};
let carrito = [];
let paginaActual = 1;

let contenedor, selectCategoria, inputBusqueda, paginacion, cargando;

/* =========================================================
   3) INICIO: trae productos + config desde la base de datos
   ========================================================= */
async function init() {
    contenedor = document.getElementById("contenedor-productos");
    selectCategoria = document.querySelector(".form-select");
    inputBusqueda = document.querySelector(".form-control");
    paginacion = document.getElementById("paginacion");
    cargando = document.getElementById("cargando-productos");

    try {
        const [resProductos, resConfig] = await Promise.all([
            fetch(`${SHEETDB_URL}?sheet=Productos`),
            fetch(`${SHEETDB_URL}?sheet=Config`)
        ]);

        if (!resProductos.ok || !resConfig.ok) {
            throw new Error("La base de datos respondió con error");
        }

        productosData = await resProductos.json();
        const configFilas = await resConfig.json();
        config = Object.fromEntries(configFilas.map(fila => [fila.clave, fila.valor]));
    } catch (error) {
        console.error("No se pudieron cargar los productos:", error);
        cargando.innerHTML = `<p class="text-danger">No se pudieron cargar los productos. Probá recargar la página.</p>`;
        return;
    }

    cargando.style.display = "none";

    poblarCategorias();
    renderizarMediosDePago();
    configurarEventos();
    renderizar();
}

/* =========================================================
   4) CÁLCULO DE PRECIO CON DESCUENTO / PROMO
   ========================================================= */
function precioFinal(producto) {
    const precio = Number(producto.precio) || 0;
    const descuento = Number(producto.descuento) || 0;
    const promoActiva = esVerdadero(producto.promoActiva);

    if (promoActiva && descuento > 0) {
        return Math.round(precio - (precio * descuento) / 100);
    }
    return precio;
}

function esVerdadero(valor) {
    return String(valor).trim().toUpperCase() === "TRUE";
}

function estaActivo(producto) {
    // Si la columna "activo" está vacía o dice cualquier cosa que no sea "FALSE",
    // el producto se muestra. Solo se oculta si dice explícitamente "FALSE".
    return String(producto.activo || "").trim().toUpperCase() !== "FALSE";
}

/* =========================================================
   5) FILTRADO
   ========================================================= */
function obtenerProductosFiltrados() {
    const categoria = selectCategoria.value;
    const texto = inputBusqueda.value.toLowerCase();

    return productosData.filter(producto => {
        const activo = estaActivo(producto);
        const coincideCategoria = categoria === "Todas las categorías" || producto.categoria === categoria;
        const coincideTexto = (producto.nombre || "").toLowerCase().includes(texto);
        return activo && coincideCategoria && coincideTexto;
    });
}

/* =========================================================
   6) RENDER DE PRODUCTOS + PAGINACIÓN
   ========================================================= */
function renderizar() {
    const filtrados = obtenerProductosFiltrados();
    const totalPaginas = Math.ceil(filtrados.length / PRODUCTOS_POR_PAGINA) || 1;

    if (paginaActual > totalPaginas) paginaActual = 1;

    const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
    const enPagina = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

    contenedor.innerHTML = enPagina.length
        ? enPagina.map(crearCardHTML).join("")
        : `<p class="text-center w-100">No se encontraron productos.</p>`;

    document.querySelectorAll(".btn-comprar").forEach(btn => {
        btn.addEventListener("click", function () {
            carrito.push({
                nombre: this.dataset.nombre,
                precio: Number(this.dataset.precio)
            });
            actualizarCarrito();
            mostrarToast();
        });
    });

    generarBotonesPaginacion(totalPaginas);
}

function crearCardHTML(producto) {
    const precioOriginal = Number(producto.precio) || 0;
    const final = precioFinal(producto);
    const tieneDescuento = final < precioOriginal;

    return `
    <div class="col mb-4 producto-card" data-categoria="${producto.categoria || ""}">
        <div class="card shadow h-100">
            <div class="img-hover-wrap">
                <img src="${producto.imagen || 'https://placehold.co/400x300/DDE7D4/3E4A3C?text=Producto'}" class="card-img-top img-normal">
                ${producto.imagenHover ? `<img src="${producto.imagenHover}" class="card-img-top img-hover">` : ""}
                ${tieneDescuento ? `<span class="badge-descuento">-${producto.descuento}%</span>` : ""}
            </div>
            <div class="card-body">
                <h5>${producto.nombre || ""}</h5>
                ${producto.descripcionCorta ? `<p>${producto.descripcionCorta}</p>` : ""}
                ${producto.descripcionLarga ? `<p>${producto.descripcionLarga}</p>` : ""}
                <div class="precio-wrap">
                    ${tieneDescuento ? `<span class="precio-anterior">${formatearPrecio(precioOriginal)}</span>` : ""}
                    <h4>${formatearPrecio(final)}</h4>
                </div>
                <button class="btn-mandala w-100 btn-comprar" data-nombre="${producto.nombre || ""}" data-precio="${final}">Comprar</button>
            </div>
        </div>
    </div>`;
}

function generarBotonesPaginacion(totalPaginas) {
    paginacion.innerHTML = "";

    for (let i = 1; i <= totalPaginas; i++) {
        const li = document.createElement("li");
        li.className = "page-item" + (i === paginaActual ? " active" : "");

        const link = document.createElement("a");
        link.className = "page-link";
        link.href = "#";
        link.textContent = i;

        link.addEventListener("click", function (e) {
            e.preventDefault();
            paginaActual = i;
            renderizar();
        });

        li.appendChild(link);
        paginacion.appendChild(li);
    }
}

/* =========================================================
   7) CATEGORÍAS DINÁMICAS (se generan solas según tus productos)
   ========================================================= */
function poblarCategorias() {
    const categorias = [...new Set(productosData.map(p => p.categoria).filter(Boolean))];

    selectCategoria.innerHTML =
        `<option>Todas las categorías</option>` +
        categorias.map(c => `<option>${c}</option>`).join("");
}

/* =========================================================
   8) MEDIOS DE PAGO (vienen de la hoja "Config", columna medios_pago)
   ========================================================= */
function renderizarMediosDePago() {
    const contenedorPago = document.getElementById("medios-pago");
    if (!contenedorPago || !config.medios_pago) return;

    const medios = config.medios_pago.split(",").map(m => m.trim()).filter(Boolean);
    contenedorPago.innerHTML = medios
        .map(m => `<span class="badge-pago">${m}</span>`)
        .join(" ");
}

/* =========================================================
   9) CARRITO Y PEDIDO POR WHATSAPP
   ========================================================= */
function formatearPrecio(numero) {
    return "$" + Number(numero).toLocaleString("es-AR");
}

function mostrarToast() {
    const toast = document.getElementById("toastConfirmacion");
    toast.classList.add("mostrar");
    setTimeout(() => toast.classList.remove("mostrar"), 2000);
}

function actualizarCarrito() {
    const lista = document.getElementById("listaCarrito");
    const total = document.getElementById("totalCarrito");
    const contador = document.getElementById("contadorCarrito");

    lista.innerHTML = "";
    let suma = 0;

    carrito.forEach((item, index) => {
        suma += item.precio;
        const li = document.createElement("li");
        li.innerHTML = `<span>${item.nombre} - ${formatearPrecio(item.precio)}</span>
                         <button data-index="${index}">✕</button>`;
        lista.appendChild(li);
    });

    total.textContent = formatearPrecio(suma);
    contador.textContent = carrito.length;

    document.querySelectorAll("#listaCarrito button").forEach(btn => {
        btn.addEventListener("click", function () {
            carrito.splice(Number(this.dataset.index), 1);
            actualizarCarrito();
        });
    });
}

function configurarEventos() {
    selectCategoria.addEventListener("change", function () {
        paginaActual = 1;
        renderizar();
    });

    inputBusqueda.addEventListener("input", function () {
        paginaActual = 1;
        renderizar();
    });

    document.getElementById("btnWhatsapp").addEventListener("click", function () {
        if (carrito.length === 0) {
            alert("Tu carrito está vacío");
            return;
        }

        const numeroWhatsapp = config.numeroWhatsapp || NUMERO_WHATSAPP_DEFAULT;

        let mensaje = "Hola! Quiero hacer este pedido:%0A%0A";
        let total = 0;

        carrito.forEach(item => {
            mensaje += `- ${item.nombre}: ${formatearPrecio(item.precio)}%0A`;
            total += item.precio;
        });

        mensaje += `%0ATotal: ${formatearPrecio(total)}`;

        window.open(`https://wa.me/${numeroWhatsapp}?text=${mensaje}`, "_blank");
    });
}
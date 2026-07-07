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

let contenedor, selectCategoria, selectMarca, selectOrden, inputBusqueda, paginacion, cargando;

/* =========================================================
   3) INICIO: trae productos + config desde la base de datos
   ========================================================= */
async function init() {
    contenedor = document.getElementById("contenedor-productos");
    selectCategoria = document.getElementById("filtroCategoria");
    selectMarca = document.getElementById("filtroMarca");
    selectOrden = document.getElementById("ordenPrecio");
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
        productosData = productosData.map(limpiarClavesProducto);

        const configFilas = await resConfig.json();
        config = Object.fromEntries(
            configFilas.map(fila => [
                String(fila.clave || "").trim(),
                String(fila.valor || "").trim()
            ])
        );
        console.log("Config cargada:", config); // Podés ver esto en la consola (F12) para revisar qué llegó
    } catch (error) {
        console.error("No se pudieron cargar los productos:", error);
        cargando.innerHTML = `<p class="text-danger">No se pudieron cargar los productos. Probá recargar la página.</p>`;
        return;
    }

    cargando.style.display = "none";

    poblarCategorias();
    renderizarMediosDePago();
    renderizarAvisoEnvioGratis();
    configurarEventos();
    renderizar();
}

/* =========================================================
   3.1) LIMPIEZA DE DATOS — evita que espacios de más en los
   títulos de columna de la planilla rompan el sitio
   ========================================================= */
function limpiarClavesProducto(producto) {
    const limpio = {};
    Object.keys(producto).forEach(clave => {
        limpio[clave.trim()] = producto[clave];
    });
    return limpio;
}

/* =========================================================
   3.2) LIMPIEZA DE PRECIOS — soporta números planos ("39990"),
   con separador de miles ("42.900") y el formato truncado que
   exportan algunas tiendas ("$42.90" en realidad es $42.900)
   ========================================================= */
function limpiarPrecio(valorCrudo) {
    if (valorCrudo === undefined || valorCrudo === null || valorCrudo === "") return 0;

    let texto = String(valorCrudo).replace(/\$/g, "").trim();
    if (!texto) return 0;

    const partes = texto.split(".");

    // Caso "42.90" → en realidad es $42.900 (se truncó el último cero al exportar)
    if (partes.length === 2 && partes[1].length === 2) {
        return Math.round(parseFloat(texto) * 1000);
    }

    // Cualquier otro punto se interpreta como separador de miles (ej "42.900" → 42900)
    texto = texto.replace(/\./g, "");
    const numero = Number(texto);
    return isNaN(numero) ? 0 : numero;
}

/* =========================================================
   4) CÁLCULO DE PRECIO CON DESCUENTO / PROMO
   ========================================================= */
function precioFinal(producto) {
    const precio = limpiarPrecio(producto.precio);
    const descuento = Number(String(producto.descuento || "").replace(/%/g, "").trim()) || 0;
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
    const marca = selectMarca.value;
    const texto = inputBusqueda.value.toLowerCase();

    return productosData.filter(producto => {
        const activo = estaActivo(producto);
        const coincideCategoria = categoria === "Todas las categorías" || producto.categoria === categoria;
        const coincideMarca = marca === "Todas las marcas" || producto.marca === marca;
        const coincideTexto = (producto.nombre || "").toLowerCase().includes(texto);
        return activo && coincideCategoria && coincideMarca && coincideTexto;
    });
}

/* =========================================================
   6) RENDER DE PRODUCTOS + PAGINACIÓN
   ========================================================= */
function renderizar() {
    let filtrados = obtenerProductosFiltrados();
    filtrados = ordenarProductos(filtrados);

    const totalPaginas = Math.ceil(filtrados.length / PRODUCTOS_POR_PAGINA) || 1;

    if (paginaActual > totalPaginas) paginaActual = 1;

    const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
    const enPagina = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

    contenedor.innerHTML = enPagina.length
        ? enPagina.map(crearCardHTML).join("")
        : `<p class="text-center w-100">No se encontraron productos.</p>`;

    document.querySelectorAll(".btn-comprar").forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.stopPropagation(); // evita que el click también abra el modal de detalle
            carrito.push({
                nombre: this.dataset.nombre,
                precio: Number(this.dataset.precio)
            });
            actualizarCarrito();
            mostrarToast();
        });
    });

    // Click en cualquier parte de la card (menos el botón Comprar) abre el modal con la descripción completa
    const cards = contenedor.querySelectorAll(".card-clickeable");
    enPagina.forEach((producto, i) => {
        if (cards[i]) {
            cards[i].addEventListener("click", () => abrirModalProducto(producto));
        }
    });

    generarBotonesPaginacion(totalPaginas);
}

/* =========================================================
   6.1) MODAL DE DETALLE DE PRODUCTO
   ========================================================= */
function abrirModalProducto(producto) {
    const precioOriginal = limpiarPrecio(producto.precio);
    const final = precioFinal(producto);
    const tieneDescuento = final < precioOriginal;

    document.getElementById("modalProductoNombre").textContent = producto.nombre || "";
    document.getElementById("modalProductoImagen").src =
        producto.imagen || "https://placehold.co/400x300/DDE7D4/3E4A3C?text=Producto";
    document.getElementById("modalProductoMarca").textContent = producto.marca || "";
    document.getElementById("modalProductoDescripcionCorta").textContent = producto.descripcionCorta || "";
    document.getElementById("modalProductoDescripcionLarga").textContent = producto.descripcionLarga || "";

    const precioAnteriorEl = document.getElementById("modalProductoPrecioAnterior");
    precioAnteriorEl.textContent = tieneDescuento ? formatearPrecio(precioOriginal) : "";
    document.getElementById("modalProductoPrecioFinal").textContent = formatearPrecio(final);

    const btnComprar = document.getElementById("modalProductoBtnComprar");
    btnComprar.dataset.nombre = producto.nombre || "";
    btnComprar.dataset.precio = final;
    btnComprar.onclick = function () {
        carrito.push({ nombre: producto.nombre, precio: final });
        actualizarCarrito();
        mostrarToast();
        bootstrap.Modal.getOrCreateInstance(document.getElementById("modalProducto")).hide();
    };

    bootstrap.Modal.getOrCreateInstance(document.getElementById("modalProducto")).show();
}

function ordenarProductos(lista) {
    const orden = selectOrden.value;
    const copia = [...lista];

    if (orden === "menor") {
        copia.sort((a, b) => precioFinal(a) - precioFinal(b));
    } else if (orden === "mayor") {
        copia.sort((a, b) => precioFinal(b) - precioFinal(a));
    }
    // "relevancia" no reordena, se mantiene el orden de la planilla
    return copia;
}

function crearCardHTML(producto) {
    const precioOriginal = limpiarPrecio(producto.precio);
    const final = precioFinal(producto);
    const tieneDescuento = final < precioOriginal;
    const esDestacado = esVerdadero(producto.destacado);

    const stockDefinido = producto.stock !== undefined && producto.stock !== "";
    const stockNumero = stockDefinido ? Number(producto.stock) : null;
    const sinStock = stockDefinido && stockNumero <= 0;
    const stockBajo = stockDefinido && stockNumero > 0 && stockNumero <= 5;

    return `
    <div class="col mb-4 producto-card" data-categoria="${producto.categoria || ""}">
        <div class="card shadow h-100 card-clickeable" role="button">
            <div class="img-hover-wrap">
                <img src="${producto.imagen || 'https://placehold.co/400x300/DDE7D4/3E4A3C?text=Producto'}" class="card-img-top img-normal">
                ${producto.imagenHover ? `<img src="${producto.imagenHover}" class="card-img-top img-hover">` : ""}
                ${tieneDescuento ? `<span class="badge-descuento">-${String(producto.descuento).replace(/%/g, "").trim()}%</span>` : ""}
                ${esDestacado ? `<span class="badge-destacado">★ Más vendido</span>` : ""}
            </div>
            <div class="card-body">
                <h5>${producto.nombre || ""}</h5>
                ${producto.marca ? `<p class="marca-producto">${producto.marca}</p>` : ""}
                ${producto.descripcionCorta ? `<p>${producto.descripcionCorta}</p>` : ""}
                ${stockBajo ? `<p class="aviso-stock">¡Últimas ${stockNumero} unidades!</p>` : ""}
                <div class="precio-wrap">
                    ${tieneDescuento ? `<span class="precio-anterior">${formatearPrecio(precioOriginal)}</span>` : ""}
                    <h4>${formatearPrecio(final)}</h4>
                </div>
                <button class="btn-mandala w-100 btn-comprar" data-nombre="${producto.nombre || ""}" data-precio="${final}" ${sinStock ? "disabled" : ""}>
                    ${sinStock ? "Sin stock" : "Comprar"}
                </button>
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

    const marcas = [...new Set(productosData.map(p => p.marca).filter(Boolean))];
    selectMarca.innerHTML =
        `<option>Todas las marcas</option>` +
        marcas.map(m => `<option>${m}</option>`).join("");
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
   8.1) AVISO DE ENVÍO GRATIS
   ========================================================= */
function renderizarAvisoEnvioGratis() {
    const contenedorAviso = document.getElementById("aviso-envio-gratis");
    if (!contenedorAviso || !config.envio_gratis_desde) return;

    const monto = Number(config.envio_gratis_desde);
    if (!monto) return;

    contenedorAviso.innerHTML =
        `<span class="badge-envio-gratis"><span class="camion">🚚</span> Envío gratis en compras desde ${formatearPrecio(monto)}</span>`;
}

function actualizarAvisoEnvioCarrito(totalCarrito) {
    const aviso = document.getElementById("avisoEnvioCarrito");
    if (!aviso) return;

    const monto = Number(config.envio_gratis_desde);
    if (!monto) {
        aviso.innerHTML = "";
        return;
    }

    if (totalCarrito >= monto) {
        aviso.innerHTML = `<p class="texto-envio-gratis-ok">✓ ¡Tenés envío gratis!</p>`;
    } else {
        const faltante = monto - totalCarrito;
        aviso.innerHTML = `<p class="texto-envio-gratis">Te faltan ${formatearPrecio(faltante)} para tener envío gratis</p>`;
    }
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
    actualizarAvisoEnvioCarrito(suma);

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

    selectMarca.addEventListener("change", function () {
        paginaActual = 1;
        renderizar();
    });

    selectOrden.addEventListener("change", function () {
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
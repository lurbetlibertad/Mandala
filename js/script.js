document.addEventListener("DOMContentLoaded", init);

/* =========================================================
   1) CONFIGURACIÓN — lo único que tenés que tocar en el código
   ========================================================= */
const SPREADSHEET_ID = "1wjad7AZpvZQPueGCmnb8qg6zSFxjLMIR21V4r2ZxK0I";
const NUMERO_WHATSAPP_DEFAULT = "5491100000000";
const PRODUCTOS_POR_PAGINA = 6;

/* =========================================================
   2) ESTADO GLOBALES
   ========================================================= */
let productosData = [];
let config = {};
let carrito = [];
let paginaActual = 1;
let grupoPagina = 0;
const PAGINAS_POR_GRUPO = 3;
let indiceActivo = -1;

// Elementos del DOM
let contenedor, selectCategoria, selectMarca, selectOrden, paginacion, cargando;
let inputBuscador, listaSugerencias, btnLimpiar, sinResultados;

/* =========================================================
   3) INICIO: trae productos + config desde la base de datos
   ========================================================= */
async function init() {
    contenedor = document.getElementById("contenedor-productos");
    selectCategoria = document.getElementById("filtroCategoria");
    selectMarca = document.getElementById("filtroMarca");
    selectOrden = document.getElementById("ordenPrecio");
    paginacion = document.getElementById("paginacion");
    cargando = document.getElementById("cargando-productos");

    // Elementos del buscador avanzado
    inputBuscador = document.getElementById("buscadorProductos");
    listaSugerencias = document.getElementById("listaSugerencias");
    btnLimpiar = document.getElementById("btnLimpiarBusqueda");
    sinResultados = document.getElementById("sinResultadosBusqueda");

    try {
        const [productosCrudos, configCrudo] = await Promise.all([
            cargarHojaComoObjetos("Productos"),
            cargarHojaComoObjetos("Config")
        ]);

        productosData = productosCrudos.map(limpiarClavesProducto);

        config = Object.fromEntries(
            configCrudo.map(fila => [
                String(fila.clave || "").trim(),
                String(fila.valor || "").trim()
            ])
        );
        console.log("Config cargada:", config);
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
    configurarEventosBuscadorAvanzado();
}

/* =========================================================
   3.0) LECTURA DE LA GOOGLE SHEET (CSV público, sin límite de requests)
   ========================================================= */
function urlHojaCSV(nombreHoja) {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombreHoja)}&_=${Date.now()}`;
}

async function cargarHojaComoObjetos(nombreHoja) {
    const respuesta = await fetch(urlHojaCSV(nombreHoja));

    if (!respuesta.ok) {
        throw new Error(`No se pudo leer la hoja "${nombreHoja}" (status ${respuesta.status}). ` +
            `Revisá que la pestaña se llame exactamente así y que el Sheet esté compartido como ` +
            `"Cualquiera con el enlace puede ver".`);
    }

    const textoCSV = await respuesta.text();

    const resultado = Papa.parse(textoCSV, {
        header: true,
        skipEmptyLines: true
    });

    if (resultado.errors && resultado.errors.length) {
        console.warn(`Avisos al parsear la hoja "${nombreHoja}":`, resultado.errors);
    }

    return resultado.data;
}

/* =========================================================
   3.1) LIMPIEZA DE DATOS Y PRECIOS
   ========================================================= */
function limpiarClavesProducto(producto) {
    const limpio = {};
    Object.keys(producto).forEach(clave => {
        limpio[clave.trim()] = producto[clave];
    });
    return limpio;
}

function limpiarPrecio(valorCrudo) {
    if (valorCrudo === undefined || valorCrudo === null || valorCrudo === "") return 0;

    let texto = String(valorCrudo).replace(/\$/g, "").trim();
    if (!texto) return 0;

    const partes = texto.split(".");

    if (partes.length === 2 && partes[1].length === 2) {
        return Math.round(parseFloat(texto) * 1000);
    }

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
    return String(producto.activo || "").trim().toUpperCase() !== "FALSE";
}

/* =========================================================
   5) FILTRADO GENERAL (Por selectores)
   ========================================================= */
function obtenerProductosFiltrados() {
    const categoria = selectCategoria.value;
    const marca = selectMarca.value;

    return productosData.filter(producto => {
        const activo = estaActivo(producto);
        const coincideCategoria = categoria === "Todas las categorías" || producto.categoria === categoria;
        const coincideMarca = marca === "Todas las marcas" || producto.marca === marca;
        return activo && coincideCategoria && coincideMarca;
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

    // Eventos de botones de compra
    document.querySelectorAll(".btn-comprar").forEach(btn => {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            carrito.push({
                nombre: this.dataset.nombre,
                precio: Number(this.dataset.precio)
            });
            actualizarCarrito();
            mostrarToast();
        });
    });

    // Eventos para abrir modal
    const cards = contenedor.querySelectorAll(".card-clickeable");
    enPagina.forEach((producto, i) => {
        if (cards[i]) {
            cards[i].addEventListener("click", () => abrirModalProducto(producto));
        }
    });

    generarBotonesPaginacion(totalPaginas);
}

function generarBotonesPaginacion(totalPaginas) {
    paginacion.innerHTML = "";
    grupoPagina = Math.floor((paginaActual - 1) / PAGINAS_POR_GRUPO);

    const inicio = grupoPagina * PAGINAS_POR_GRUPO + 1;
    const fin = Math.min(inicio + PAGINAS_POR_GRUPO - 1, totalPaginas);

    if (grupoPagina > 0) {
        const li = document.createElement("li");
        li.className = "page-item";
        li.innerHTML = `<a class="page-link" href="#"><i class="bi bi-chevron-left"></i></a>`;
        li.onclick = (e) => {
            e.preventDefault();
            grupoPagina--;
            paginaActual = grupoPagina * PAGINAS_POR_GRUPO + 1;
            renderizar();
        };
        paginacion.appendChild(li);
    }

    for (let i = inicio; i <= fin; i++) {
        const li = document.createElement("li");
        li.className = "page-item" + (i === paginaActual ? " active" : "");
        li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
        li.onclick = (e) => {
            e.preventDefault();
            paginaActual = i;
            renderizar();
        };
        paginacion.appendChild(li);
    }

    if (fin < totalPaginas) {
        const li = document.createElement("li");
        li.className = "page-item";
        li.innerHTML = `<a class="page-link" href="#"><i class="bi bi-chevron-right"></i></a>`;
        li.onclick = (e) => {
            e.preventDefault();
            grupoPagina++;
            paginaActual = grupoPagina * PAGINAS_POR_GRUPO + 1;
            renderizar();
        };
        paginacion.appendChild(li);
    }
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

/* =========================================================
   7) CATEGORÍAS DINÁMICAS
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
   8) MEDIOS DE PAGO Y ENVÍO
   ========================================================= */
function renderizarMediosDePago() {
    const contenedorPago = document.getElementById("medios-pago");
    if (!contenedorPago || !config.medios_pago) return;

    const medios = config.medios_pago.split(",").map(m => m.trim()).filter(Boolean);
    contenedorPago.innerHTML = medios
        .map(m => `<span class="badge-pago">${m}</span>`)
        .join(" ");
}

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
    if (toast) {
        toast.classList.add("mostrar");
        setTimeout(() => toast.classList.remove("mostrar"), 2000);
    }
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

/* =========================================================
   10) BUSCADOR AVANZADO CON SUGERENCIAS
   ========================================================= */
function configurarEventosBuscadorAvanzado() {
    if (!inputBuscador || !contenedor) return;

    function normalizar(texto) {
        return (texto || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .trim();
    }

    function obtenerCards() {
        return Array.from(contenedor.querySelectorAll(".card"));
    }

    function nombreDeCard(card) {
        const titulo = card.querySelector(".card-body h5, .card-title");
        return titulo ? titulo.textContent.trim() : "";
    }

    function resaltarCoincidencia(nombre, valor) {
        const nombreNorm = normalizar(nombre);
        const valorNorm = normalizar(valor);
        const idx = nombreNorm.indexOf(valorNorm);
        if (idx === -1) return nombre;
        return (
            nombre.slice(0, idx) +
            "<strong>" + nombre.slice(idx, idx + valor.length) + "</strong>" +
            nombre.slice(idx + valor.length)
        );
    }

    function aplicarFiltro(valor) {
        const termino = normalizar(valor);
        const cards = obtenerCards();
        let visibles = 0;

        cards.forEach(function (card) {
            const coincide = !termino || normalizar(nombreDeCard(card)).includes(termino);
            const columna = card.closest(".col") || card;
            columna.style.display = coincide ? "" : "none";
            if (coincide) visibles++;
        });

        if (paginacion) paginacion.style.display = termino ? "none" : "";
        if (sinResultados) sinResultados.style.display = (termino && visibles === 0) ? "block" : "none";
    }

    function ocultarSugerencias() {
        if (!listaSugerencias) return;
        listaSugerencias.classList.remove("mostrar");
        listaSugerencias.innerHTML = "";
        indiceActivo = -1;
    }

    function mostrarSugerencias(valor) {
        if (!listaSugerencias) return;
        const termino = normalizar(valor);
        listaSugerencias.innerHTML = "";
        indiceActivo = -1;

        if (!termino) {
            ocultarSugerencias();
            return;
        }

        const nombres = [...new Set(obtenerCards().map(nombreDeCard).filter(Boolean))];
        const coincidencias = nombres
            .filter(function (nombre) { return normalizar(nombre).includes(termino); })
            .slice(0, 6);

        if (!coincidencias.length) {
            ocultarSugerencias();
            return;
        }

        coincidencias.forEach(function (nombre) {
            const li = document.createElement("li");
            li.innerHTML = '<i class="bi bi-search"></i> <span>' + resaltarCoincidencia(nombre, valor) + '</span>';
            li.addEventListener("click", function () {
                seleccionarSugerencia(nombre);
            });
            listaSugerencias.appendChild(li);
        });

        listaSugerencias.classList.add("mostrar");
    }

    function seleccionarSugerencia(nombre) {
        inputBuscador.value = nombre;
        aplicarFiltro(nombre);
        ocultarSugerencias();
        if (btnLimpiar) btnLimpiar.classList.add("visible");

        const cardCoincide = obtenerCards().find(function (card) {
            return nombreDeCard(card) === nombre;
        });
        if (cardCoincide) {
            cardCoincide.scrollIntoView({ behavior: "smooth", block: "center" });
            cardCoincide.classList.add("card-destacada");
            setTimeout(function () { cardCoincide.classList.remove("card-destacada"); }, 1200);
        }
    }

    inputBuscador.addEventListener("input", function () {
        const valor = this.value;
        if (btnLimpiar) btnLimpiar.classList.toggle("visible", valor.length > 0);
        aplicarFiltro(valor);
        mostrarSugerencias(valor);
    });

    inputBuscador.addEventListener("focus", function () {
        if (this.value) mostrarSugerencias(this.value);
    });

    inputBuscador.addEventListener("keydown", function (e) {
        if (!listaSugerencias) return;
        const items = Array.from(listaSugerencias.querySelectorAll("li"));
        if (!items.length) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            indiceActivo = (indiceActivo + 1) % items.length;
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            indiceActivo = (indiceActivo - 1 + items.length) % items.length;
        } else if (e.key === "Enter") {
            if (indiceActivo >= 0) {
                e.preventDefault();
                items[indiceActivo].click();
            } else {
                ocultarSugerencias();
            }
            return;
        } else if (e.key === "Escape") {
            ocultarSugerencias();
            return;
        } else {
            return;
        }

        items.forEach(function (item, i) {
            item.classList.toggle("activa", i === indiceActivo);
        });
        if (items[indiceActivo]) items[indiceActivo].scrollIntoView({ block: "nearest" });
    });

    if (btnLimpiar) {
        btnLimpiar.addEventListener("click", function () {
            inputBuscador.value = "";
            aplicarFiltro("");
            ocultarSugerencias();
            this.classList.remove("visible");
            inputBuscador.focus();
        });
    }

    document.addEventListener("click", function (e) {
        if (!e.target.closest(".buscador-wrap") && !e.target.closest("#listaSugerencias")) {
            ocultarSugerencias();
        }
    });

    // Observador para cuando cambia la paginación o filtros externos re-renderizan
    const observador = new MutationObserver(function () {
        if (inputBuscador.value) aplicarFiltro(inputBuscador.value);
    });
    observador.observe(contenedor, { childList: true });
}
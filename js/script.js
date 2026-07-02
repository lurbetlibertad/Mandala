document.addEventListener("DOMContentLoaded", function () {

    const productos = document.querySelectorAll(".producto-card");
    const selectCategoria = document.querySelector(".form-select");
    const inputBusqueda = document.querySelector(".form-control");
    const paginacion = document.getElementById("paginacion");
    const porPagina = 3;

    let paginaActual = 1;

    function obtenerProductosFiltrados() {
        const categoria = selectCategoria.value;
        const texto = inputBusqueda.value.toLowerCase();

        return Array.from(productos).filter(producto => {
            const catProducto = producto.dataset.categoria;
            const nombre = producto.querySelector("h5").textContent.toLowerCase();

            const coincideCategoria = (categoria === "Todas las categorías" || catProducto === categoria);
            const coincideTexto = nombre.includes(texto);

            return coincideCategoria && coincideTexto;
        });
    }

    function renderizar() {
        // Ocultar todas las cards primero
        productos.forEach(p => p.style.display = "none");

        const filtrados = obtenerProductosFiltrados();
        const totalPaginas = Math.ceil(filtrados.length / porPagina) || 1;

        if (paginaActual > totalPaginas) paginaActual = 1;

        const inicio = (paginaActual - 1) * porPagina;
        const finales = filtrados.slice(inicio, inicio + porPagina);

        finales.forEach(p => p.style.display = "block");

        generarBotonesPaginacion(totalPaginas);
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

    selectCategoria.addEventListener("change", function () {
        paginaActual = 1;
        renderizar();
    });
    let carrito = [];

const numeroWhatsapp = "5491100000000"; // ⚠️ cambiá esto por tu número real, con código de país sin +

function formatearPrecio(numero) {
    return "$" + numero.toLocaleString("es-AR");
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
            carrito.splice(this.dataset.index, 1);
            actualizarCarrito();
        });
    });
}

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

document.getElementById("btnWhatsapp").addEventListener("click", function () {
    if (carrito.length === 0) {
        alert("Tu carrito está vacío");
        return;
    }

    let mensaje = "Hola! Quiero hacer este pedido:%0A%0A";
    let total = 0;

    carrito.forEach(item => {
        mensaje += `- ${item.nombre}: ${formatearPrecio(item.precio)}%0A`;
        total += item.precio;
    });

    mensaje += `%0ATotal: ${formatearPrecio(total)}`;

    window.open(`https://wa.me/${numeroWhatsapp}?text=${mensaje}`, "_blank");
});

    inputBusqueda.addEventListener("input", function () {
        paginaActual = 1;
        renderizar();
    });

    renderizar();
});
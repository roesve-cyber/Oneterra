// ============================================================
// Registro de Movimientos Bancarios y Dividendos — app.js
// ============================================================

let _cuentas = [];
let _movimientos = [];
let _dividendos = [];
let _unsubs = [];

const $ = (id) => document.getElementById(id);
const dinero = (n) => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hoyISO = () => new Date().toISOString().slice(0, 10);
const fechaBonita = (iso) => {
    const [y, m, d] = (iso || '').split('-');
    return (y && m && d) ? `${d}-${m}-${y}` : (iso || '');
};

// ---------- AUTENTICACIÓN ----------
auth.onAuthStateChanged(user => {
    if (user) {
        $('pantallaLogin').style.display = 'none';
        $('appPrincipal').style.display = 'block';
        $('correoActual').textContent = user.email;
        iniciarEscuchas();
    } else {
        $('pantallaLogin').style.display = 'flex';
        $('appPrincipal').style.display = 'none';
        _unsubs.forEach(u => u());
        _unsubs = [];
    }
});

function iniciarSesion() {
    const email = $('loginEmail').value.trim();
    const pass = $('loginPass').value;
    $('loginError').textContent = '';
    auth.signInWithEmailAndPassword(email, pass).catch(err => {
        $('loginError').textContent = 'No se pudo entrar: ' + (err.message || err.code);
    });
}

function cerrarSesion() {
    auth.signOut();
}

// ---------- ESCUCHAS EN VIVO ----------
function iniciarEscuchas() {
    _unsubs.push(db.collection('cuentas').orderBy('creadoEn', 'asc').onSnapshot(snap => {
        _cuentas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderCuentas();
        renderSelectsCuentas();
        renderResumen();
    }, err => console.error('Error leyendo cuentas:', err)));

    _unsubs.push(db.collection('movimientos').orderBy('fecha', 'desc').onSnapshot(snap => {
        _movimientos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderMovimientos();
        renderResumen();
    }, err => console.error('Error leyendo movimientos:', err)));

    _unsubs.push(db.collection('dividendos').orderBy('fecha', 'desc').onSnapshot(snap => {
        _dividendos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDividendos();
        renderResumen();
    }, err => console.error('Error leyendo dividendos:', err)));
}

// ---------- CÁLCULO DE SALDOS ----------
// Saldo de una cuenta = saldo inicial capturado al darla de alta, más/menos
// cada movimiento que le pertenece. Los dividendos NO se suman aparte: si
// se ligaron a una cuenta, ya generaron su propio movimiento tipo depósito
// (ver guardarDividendo), así que contarlos dos veces duplicaría el dinero.
function saldoDeCuenta(cuentaId) {
    let saldo = Number(_cuentas.find(c => c.id === cuentaId)?.saldoInicial) || 0;
    _movimientos.forEach(m => {
        const monto = Number(m.monto) || 0;
        if (m.tipo === 'deposito' && m.cuentaId === cuentaId) saldo += monto;
        else if (m.tipo === 'retiro' && m.cuentaId === cuentaId) saldo -= monto;
        else if (m.tipo === 'transferencia') {
            if (m.cuentaId === cuentaId) saldo -= monto;
            if (m.cuentaDestinoId === cuentaId) saldo += monto;
        }
    });
    return saldo;
}

// ---------- CUENTAS ----------
function guardarCuenta() {
    const nombre = $('cuentaNombre').value.trim();
    const tipo = $('cuentaTipo').value;
    const saldoInicial = parseFloat($('cuentaSaldoInicial').value) || 0;
    if (!nombre) return alert('Ponle un nombre a la cuenta.');
    db.collection('cuentas').add({
        nombre, tipo, saldoInicial, activa: true,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
        creadoPor: auth.currentUser?.email || ''
    }).then(() => {
        $('cuentaNombre').value = '';
        $('cuentaSaldoInicial').value = '0';
    }).catch(err => alert('No se pudo guardar la cuenta: ' + err.message));
}

function eliminarCuenta(id) {
    const tieneMovimientos = _movimientos.some(m => m.cuentaId === id || m.cuentaDestinoId === id);
    if (tieneMovimientos) {
        alert('Esta cuenta ya tiene movimientos registrados -- no se puede eliminar (perderías el historial). Si ya no la usas, puedes dejarla en $0 en vez de borrarla.');
        return;
    }
    if (!confirm('¿Eliminar esta cuenta? No tiene movimientos, así que es seguro.')) return;
    db.collection('cuentas').doc(id).delete();
}

function renderCuentas() {
    const html = !_cuentas.length
        ? '<p class="vacio">Aún no das de alta ninguna cuenta. Agrega tus bancos y "Efectivo" arriba.</p>'
        : _cuentas.map(c => {
            const saldo = saldoDeCuenta(c.id);
            return `
        <div class="tarjeta-cuenta">
            <div class="tarjeta-cuenta-icono">${c.tipo === 'efectivo' ? '💵' : '🏦'}</div>
            <div class="tarjeta-cuenta-info">
                <div class="tarjeta-cuenta-nombre">${esc(c.nombre)}</div>
                <div class="tarjeta-cuenta-tipo">${c.tipo === 'efectivo' ? 'Efectivo' : 'Cuenta bancaria'}</div>
            </div>
            <div class="tarjeta-cuenta-saldo ${saldo < 0 ? 'negativo' : ''}">${dinero(saldo)}</div>
            <button class="btn-icono" title="Eliminar" onclick="eliminarCuenta('${c.id}')">🗑️</button>
        </div>`;
        }).join('');
    // Se pinta igual en la pestaña "Cuentas" y en la tarjeta de "Saldo por
    // cuenta" del Resumen -- son dos contenedores distintos con el mismo contenido.
    if ($('listaCuentas')) $('listaCuentas').innerHTML = html;
    if ($('listaCuentasResumen')) $('listaCuentasResumen').innerHTML = html;
}

function renderSelectsCuentas() {
    const opciones = _cuentas.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');
    ['movCuenta', 'movCuentaDestino', 'divCuenta', 'filtroCuenta'].forEach(id => {
        const sel = $(id);
        if (!sel) return;
        const valorPrevio = sel.value;
        const extra = id === 'divCuenta' ? '<option value="">-- Sin ligar a cuenta --</option>'
            : id === 'filtroCuenta' ? '<option value="">Todas las cuentas</option>' : '';
        sel.innerHTML = extra + opciones;
        if ([...sel.options].some(o => o.value === valorPrevio)) sel.value = valorPrevio;
    });
}

// ---------- MOVIMIENTOS ----------
async function guardarMovimiento() {
    const fecha = $('movFecha').value || hoyISO();
    const tipo = $('movTipo').value;
    const cuentaId = $('movCuenta').value;
    const cuentaDestinoId = $('movCuentaDestino').value;
    const monto = parseFloat($('movMonto').value) || 0;
    const concepto = $('movConcepto').value.trim();

    if (!cuentaId) return alert('Elige la cuenta.');
    if (tipo === 'transferencia' && (!cuentaDestinoId || cuentaDestinoId === cuentaId)) {
        return alert('Elige una cuenta destino distinta a la de origen.');
    }
    if (monto <= 0) return alert('El monto debe ser mayor a 0.');
    if (!concepto) return alert('Escribe un concepto -- es la evidencia de qué fue este movimiento.');

    const btn = $('btnGuardarMovimiento');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
        const datos = {
            fecha, tipo, cuentaId, monto, concepto,
            creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
            creadoPor: auth.currentUser?.email || ''
        };
        if (tipo === 'transferencia') datos.cuentaDestinoId = cuentaDestinoId;

        await db.collection('movimientos').add(datos);
        $('movMonto').value = '';
        $('movConcepto').value = '';
    } catch (err) {
        alert('No se pudo guardar el movimiento: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Registrar movimiento';
    }
}

function eliminarMovimiento(id) {
    const m = _movimientos.find(x => x.id === id);
    if (m?.esDividendo) {
        alert('Este movimiento viene de un dividendo -- elimínalo desde la pestaña Dividendos para que se borren juntos.');
        return;
    }
    if (!confirm('¿Eliminar este movimiento? No se puede deshacer.')) return;
    db.collection('movimientos').doc(id).delete();
}

function renderMovimientos() {
    const cont = $('listaMovimientos');
    if (!cont) return;
    const filtroCuenta = $('filtroCuenta')?.value || '';
    const filtroMes = $('filtroMes')?.value || '';
    let lista = _movimientos.filter(m =>
        (!filtroCuenta || m.cuentaId === filtroCuenta || m.cuentaDestinoId === filtroCuenta) &&
        (!filtroMes || (m.fecha || '').startsWith(filtroMes))
    );
    if (!lista.length) {
        cont.innerHTML = '<p class="vacio">No hay movimientos que coincidan con el filtro.</p>';
        return;
    }
    cont.innerHTML = lista.map(m => {
        const cuenta = _cuentas.find(c => c.id === m.cuentaId);
        const cuentaDestino = _cuentas.find(c => c.id === m.cuentaDestinoId);
        const etiquetaTipo = m.tipo === 'deposito' ? (m.esDividendo ? '📈 Dividendo' : '⬆️ Depósito')
            : m.tipo === 'retiro' ? '⬇️ Retiro' : '🔁 Transferencia';
        const colorMonto = (m.tipo === 'retiro' || (m.tipo === 'transferencia')) ? 'negativo' : 'positivo';
        const descCuenta = m.tipo === 'transferencia'
            ? `${esc(cuenta?.nombre || '?')} → ${esc(cuentaDestino?.nombre || '?')}`
            : esc(cuenta?.nombre || '?');
        return `
        <div class="fila-movimiento">
            <div class="fm-fecha">${fechaBonita(m.fecha)}</div>
            <div class="fm-detalle">
                <div class="fm-tipo">${etiquetaTipo} <span class="fm-cuenta">${descCuenta}</span></div>
                <div class="fm-concepto">${esc(m.concepto || '')}</div>
            </div>
            <div class="fm-monto ${colorMonto}">${dinero(m.monto)}</div>
            <button class="btn-icono" title="Eliminar" onclick="eliminarMovimiento('${m.id}')">🗑️</button>
        </div>`;
    }).join('');
}

// ---------- DIVIDENDOS ----------
async function guardarDividendo() {
    const fecha = $('divFecha').value || hoyISO();
    const monto = parseFloat($('divMonto').value) || 0;
    const fuente = $('divFuente').value.trim();
    const nota = $('divNota').value.trim();
    const cuentaId = $('divCuenta').value;

    if (monto <= 0) return alert('El monto debe ser mayor a 0.');
    if (!fuente) return alert('Escribe de dónde vino el dividendo.');

    const btn = $('btnGuardarDividendo');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
        let movimientoId = null;
        // Si se liga a una cuenta, se crea también el movimiento de depósito
        // correspondiente -- así el saldo de esa cuenta ya lo refleja solo,
        // sin capturar el mismo ingreso dos veces por separado.
        if (cuentaId) {
            const refMov = await db.collection('movimientos').add({
                fecha, tipo: 'deposito', cuentaId, monto,
                concepto: `Dividendo: ${fuente}`,
                esDividendo: true,
                creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
                creadoPor: auth.currentUser?.email || ''
            });
            movimientoId = refMov.id;
        }

        await db.collection('dividendos').add({
            fecha, monto, fuente, nota, cuentaId: cuentaId || null, movimientoId,
            creadoEn: firebase.firestore.FieldValue.serverTimestamp(),
            creadoPor: auth.currentUser?.email || ''
        });

        $('divMonto').value = '';
        $('divFuente').value = '';
        $('divNota').value = '';
    } catch (err) {
        alert('No se pudo guardar el dividendo: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '💾 Registrar dividendo';
    }
}

function eliminarDividendo(id) {
    const d = _dividendos.find(x => x.id === id);
    if (!confirm('¿Eliminar este dividendo?' + (d?.movimientoId ? ' También se eliminará el depósito que generó en la cuenta.' : ''))) return;
    const lote = db.batch();
    lote.delete(db.collection('dividendos').doc(id));
    if (d?.movimientoId) lote.delete(db.collection('movimientos').doc(d.movimientoId));
    lote.commit().catch(err => alert('No se pudo eliminar: ' + err.message));
}

function renderDividendos() {
    const cont = $('listaDividendos');
    if (!cont) return;
    if (!_dividendos.length) {
        cont.innerHTML = '<p class="vacio">Aún no registras ningún dividendo.</p>';
        return;
    }
    cont.innerHTML = _dividendos.map(d => {
        const cuenta = _cuentas.find(c => c.id === d.cuentaId);
        return `
        <div class="fila-movimiento">
            <div class="fm-fecha">${fechaBonita(d.fecha)}</div>
            <div class="fm-detalle">
                <div class="fm-tipo">📈 ${esc(d.fuente)} ${cuenta ? `<span class="fm-cuenta">→ ${esc(cuenta.nombre)}</span>` : '<span class="fm-cuenta">sin cuenta ligada</span>'}</div>
                <div class="fm-concepto">${esc(d.nota || '')}</div>
            </div>
            <div class="fm-monto positivo">${dinero(d.monto)}</div>
            <button class="btn-icono" title="Eliminar" onclick="eliminarDividendo('${d.id}')">🗑️</button>
        </div>`;
    }).join('');
}

// ---------- RESUMEN ----------
function renderResumen() {
    const cont = $('resumenTotales');
    if (!cont) return;
    const totalGeneral = _cuentas.reduce((s, c) => s + saldoDeCuenta(c.id), 0);
    const totalEfectivo = _cuentas.filter(c => c.tipo === 'efectivo').reduce((s, c) => s + saldoDeCuenta(c.id), 0);
    const totalBancos = totalGeneral - totalEfectivo;
    const mesActual = hoyISO().slice(0, 7);
    const dividendosMes = _dividendos.filter(d => (d.fecha || '').startsWith(mesActual)).reduce((s, d) => s + Number(d.monto || 0), 0);
    const dividendosTotal = _dividendos.reduce((s, d) => s + Number(d.monto || 0), 0);

    cont.innerHTML = `
        <div class="tarjeta-resumen"><div class="tr-label">Total general</div><div class="tr-valor">${dinero(totalGeneral)}</div></div>
        <div class="tarjeta-resumen"><div class="tr-label">En bancos</div><div class="tr-valor">${dinero(totalBancos)}</div></div>
        <div class="tarjeta-resumen"><div class="tr-label">En efectivo</div><div class="tr-valor">${dinero(totalEfectivo)}</div></div>
        <div class="tarjeta-resumen"><div class="tr-label">Dividendos este mes</div><div class="tr-valor">${dinero(dividendosMes)}</div></div>
        <div class="tarjeta-resumen"><div class="tr-label">Dividendos acumulados</div><div class="tr-valor">${dinero(dividendosTotal)}</div></div>
    `;
}

// ---------- UTILIDADES ----------
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cambiarPestana(nombre) {
    document.querySelectorAll('.pestana').forEach(p => p.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activa'));
    $(`pestana-${nombre}`).style.display = 'block';
    $(`tab-${nombre}`).classList.add('activa');
}

// Valores por defecto en los campos de fecha al cargar
window.addEventListener('DOMContentLoaded', () => {
    ['movFecha', 'divFecha'].forEach(id => { if ($(id)) $(id).value = hoyISO(); });
});

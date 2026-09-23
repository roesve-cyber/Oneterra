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
        renderCuentas();
        renderResumen();
    }, err => console.error('Error leyendo movimientos:', err)));

    _unsubs.push(db.collection('dividendos').orderBy('fecha', 'desc').onSnapshot(snap => {
        _dividendos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDividendos();
        renderCuentas();
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
    ['movCuenta', 'movCuentaDestino', 'divCuenta', 'filtroCuenta', 'repCuenta'].forEach(id => {
        const sel = $(id);
        if (!sel) return;
        const valorPrevio = sel.value;
        const extra = id === 'divCuenta' ? '<option value="">-- Sin ligar a cuenta --</option>'
            : id === 'filtroCuenta' ? '<option value="">Todas las cuentas</option>'
            : id === 'repCuenta' ? '<option value="">🌐 Todas las cuentas (global)</option>' : '';
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

// ============================================================
// ---------- REPORTES (estado de cuenta en imagen) ----------
// ============================================================
let _ultimoReporteDataUrl = null;
let _ultimoReporteNombre = 'estado-cuenta.png';

function pad2(n) { return String(n).padStart(2, '0'); }
function fechaLocalISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function slugify(s) {
    return String(s || 'cuenta').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cuenta';
}

function actualizarRangoReporte() {
    $('repRangoPersonalizado').style.display = $('repPeriodoTipo').value === 'personalizado' ? 'grid' : 'none';
}

// Efecto (+/-) de un movimiento sobre el saldo, según el "alcance" del reporte:
// cuentaId === null -> saldo GLOBAL (las transferencias entre cuentas propias no lo mueven).
// cuentaId === 'xxx' -> saldo de esa cuenta en particular.
function efectoMovimientoReporte(m, cuentaId) {
    const monto = Number(m.monto) || 0;
    if (!cuentaId) {
        if (m.tipo === 'deposito') return monto;
        if (m.tipo === 'retiro') return -monto;
        return 0;
    }
    if (m.tipo === 'deposito' && m.cuentaId === cuentaId) return monto;
    if (m.tipo === 'retiro' && m.cuentaId === cuentaId) return -monto;
    if (m.tipo === 'transferencia') {
        let e = 0;
        if (m.cuentaId === cuentaId) e -= monto;
        if (m.cuentaDestinoId === cuentaId) e += monto;
        return e;
    }
    return 0;
}

function dibujarGraficaSaldo(puntos) {
    const w = 600, h = 220, pad = 30;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const valores = puntos.map(p => p.saldo);
    let min = Math.min(...valores, 0), max = Math.max(...valores, 0);
    if (min === max) { min -= 1; max += 1; }
    const rango = max - min;
    const xStep = puntos.length > 1 ? (w - 2 * pad) / (puntos.length - 1) : 0;
    const yDe = (valor) => h - pad - ((valor - min) / rango) * (h - 2 * pad);

    // Línea de referencia en 0
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, yDe(0)); ctx.lineTo(w - pad, yDe(0)); ctx.stroke();

    // Línea de evolución del saldo
    ctx.strokeStyle = '#0d1b33'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    puntos.forEach((p, i) => {
        const x = pad + i * xStep, y = yDe(p.saldo);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Puntos
    ctx.fillStyle = '#0d1b33';
    puntos.forEach((p, i) => {
        const x = pad + i * xStep, y = yDe(p.saldo);
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });

    return canvas.toDataURL('image/png');
}

async function generarReporte() {
    const btn = $('btnGenerarReporte');
    btn.disabled = true;
    btn.textContent = 'Generando...';
    try {
        const cuentaId = $('repCuenta').value || null;
        const tipoPeriodo = $('repPeriodoTipo').value;
        const hoy = new Date();
        let desde = null, hasta = null;

        if (tipoPeriodo === 'mes-actual') {
            desde = `${hoy.getFullYear()}-${pad2(hoy.getMonth() + 1)}-01`;
            hasta = fechaLocalISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
        } else if (tipoPeriodo === 'mes-anterior') {
            const finAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
            const inicioAnterior = new Date(finAnterior.getFullYear(), finAnterior.getMonth(), 1);
            desde = fechaLocalISO(inicioAnterior);
            hasta = fechaLocalISO(finAnterior);
        } else if (tipoPeriodo === 'personalizado') {
            desde = $('repDesde').value || null;
            hasta = $('repHasta').value || null;
        } // 'todo' deja desde/hasta en null

        const nombreCuenta = cuentaId ? (_cuentas.find(c => c.id === cuentaId)?.nombre || 'Cuenta') : null;
        const titulo = cuentaId ? `Estado de cuenta: ${nombreCuenta}` : 'Estado de cuenta global';
        const periodoTexto = (!desde && !hasta) ? 'Todo el historial' : `${fechaBonita(desde || '')} a ${fechaBonita(hasta || '')}`;

        const movsAlcance = _movimientos.filter(m => cuentaId ? (m.cuentaId === cuentaId || m.cuentaDestinoId === cuentaId) : true);

        const base = cuentaId
            ? (Number(_cuentas.find(c => c.id === cuentaId)?.saldoInicial) || 0)
            : _cuentas.reduce((s, c) => s + (Number(c.saldoInicial) || 0), 0);

        let saldoInicialPeriodo = base;
        if (desde) {
            movsAlcance.filter(m => (m.fecha || '') < desde).forEach(m => { saldoInicialPeriodo += efectoMovimientoReporte(m, cuentaId); });
        }

        let movsPeriodo = movsAlcance.filter(m => (!desde || (m.fecha || '') >= desde) && (!hasta || (m.fecha || '') <= hasta));
        movsPeriodo = movsPeriodo.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

        let saldo = saldoInicialPeriodo, ingresos = 0, egresos = 0;
        const filas = movsPeriodo.map(m => {
            const efecto = efectoMovimientoReporte(m, cuentaId);
            saldo += efecto;
            if (efecto > 0) ingresos += efecto; else egresos += -efecto;
            return { m, efecto, saldoAcumulado: saldo };
        });
        const saldoFinal = saldo;

        const divsPeriodo = _dividendos.filter(d =>
            (cuentaId ? d.cuentaId === cuentaId : true) &&
            (!desde || (d.fecha || '') >= desde) && (!hasta || (d.fecha || '') <= hasta)
        );
        const totalDividendos = divsPeriodo.reduce((s, d) => s + (Number(d.monto) || 0), 0);

        const puntos = [{ fecha: desde || (movsPeriodo[0]?.fecha || fechaLocalISO(hoy)), saldo: saldoInicialPeriodo },
            ...filas.map(f => ({ fecha: f.m.fecha, saldo: f.saldoAcumulado }))];
        const chartDataUrl = dibujarGraficaSaldo(puntos);

        const filasHtml = filas.map(f => {
            const m = f.m;
            const etiqueta = m.tipo === 'deposito' ? (m.esDividendo ? 'Dividendo' : 'Depósito') : m.tipo === 'retiro' ? 'Retiro' : 'Transferencia';
            let detalleCuenta = '';
            if (!cuentaId) {
                const cOrig = _cuentas.find(c => c.id === m.cuentaId)?.nombre || '?';
                const cDest = _cuentas.find(c => c.id === m.cuentaDestinoId)?.nombre;
                detalleCuenta = m.tipo === 'transferencia' ? `${cOrig} → ${cDest || '?'}` : cOrig;
            } else if (m.tipo === 'transferencia') {
                detalleCuenta = m.cuentaId === cuentaId
                    ? `Salida → ${_cuentas.find(c => c.id === m.cuentaDestinoId)?.nombre || '?'}`
                    : `Entrada ← ${_cuentas.find(c => c.id === m.cuentaId)?.nombre || '?'}`;
            }
            const colorMonto = f.efecto >= 0 ? '#16a34a' : '#dc2626';
            const signo = f.efecto >= 0 ? '+' : '-';
            return `<tr>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#64748b;white-space:nowrap;">${fechaBonita(m.fecha)}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;">${etiqueta}${detalleCuenta ? `<br><span style="color:#64748b;font-size:10.5px;">${esc(detalleCuenta)}</span>` : ''}${m.concepto ? `<br><span style="color:#64748b;font-size:10.5px;">${esc(m.concepto)}</span>` : ''}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;color:${colorMonto};text-align:right;white-space:nowrap;">${signo}${dinero(Math.abs(f.efecto))}</td>
                <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:700;text-align:right;white-space:nowrap;">${dinero(f.saldoAcumulado)}</td>
            </tr>`;
        }).join('');

        const generado = hoy.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

        const htmlReporte = `
        <div style="width:640px;background:#ffffff;padding:28px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0d1b33;padding-bottom:14px;margin-bottom:4px;">
                <div style="font-size:20px;font-weight:800;color:#0d1b33;">🌎 One Terra</div>
                <div style="text-align:right;font-size:11px;color:#64748b;">Generado: ${esc(generado)}</div>
            </div>
            <div style="height:3px;background:#c99a3f;margin-bottom:18px;"></div>
            <div style="font-size:16px;font-weight:800;margin-bottom:2px;">${esc(titulo)}</div>
            <div style="font-size:12.5px;color:#64748b;margin-bottom:18px;">Periodo: ${esc(periodoTexto)}</div>

            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:18px;">
                <div style="background:#e9f5f3;border-radius:10px;padding:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;">SALDO INICIAL</div>
                    <div style="font-size:18px;font-weight:800;color:#0d1b33;">${dinero(saldoInicialPeriodo)}</div>
                </div>
                <div style="background:#e9f5f3;border-radius:10px;padding:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;">SALDO FINAL</div>
                    <div style="font-size:18px;font-weight:800;color:#0d1b33;">${dinero(saldoFinal)}</div>
                </div>
                <div style="background:#e9f5f3;border-radius:10px;padding:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;">INGRESOS</div>
                    <div style="font-size:18px;font-weight:800;color:#16a34a;">+${dinero(ingresos)}</div>
                </div>
                <div style="background:#e9f5f3;border-radius:10px;padding:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:700;">EGRESOS</div>
                    <div style="font-size:18px;font-weight:800;color:#dc2626;">-${dinero(egresos)}</div>
                </div>
            </div>

            ${totalDividendos > 0 ? `<div style="background:#f0fdf4;border-radius:10px;padding:10px 12px;margin-bottom:18px;font-size:12px;color:#166534;">📈 Dividendos recibidos en el periodo: <strong>${dinero(totalDividendos)}</strong></div>` : ''}

            <div style="font-size:12.5px;font-weight:700;color:#0d1b33;margin-bottom:6px;">Evolución del saldo</div>
            <img src="${chartDataUrl}" style="width:100%;display:block;margin-bottom:18px;border:1px solid #e2e8f0;border-radius:8px;">

            <div style="font-size:12.5px;font-weight:700;color:#0d1b33;margin-bottom:6px;">Movimientos del periodo (${filas.length})</div>
            ${filas.length ? `
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    <th style="text-align:left;padding:6px 8px;font-size:10.5px;color:#64748b;border-bottom:2px solid #0d1b33;">FECHA</th>
                    <th style="text-align:left;padding:6px 8px;font-size:10.5px;color:#64748b;border-bottom:2px solid #0d1b33;">DETALLE</th>
                    <th style="text-align:right;padding:6px 8px;font-size:10.5px;color:#64748b;border-bottom:2px solid #0d1b33;">MONTO</th>
                    <th style="text-align:right;padding:6px 8px;font-size:10.5px;color:#64748b;border-bottom:2px solid #0d1b33;">SALDO</th>
                </tr></thead>
                <tbody>${filasHtml}</tbody>
            </table>` : `<div style="text-align:center;color:#94a3b8;font-size:12.5px;padding:16px 0;">No hay movimientos en este periodo.</div>`}

            <div style="margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10.5px;color:#94a3b8;text-align:center;">Generado con One Terra</div>
        </div>`;

        const contenedor = $('repRenderArea');
        contenedor.innerHTML = htmlReporte;

        // Deja que el navegador pinte el contenido (y la imagen del gráfico) antes de capturar
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvasFinal = await html2canvas(contenedor.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        _ultimoReporteDataUrl = canvasFinal.toDataURL('image/png');
        _ultimoReporteNombre = `estado-cuenta-${cuentaId ? slugify(nombreCuenta) : 'global'}-${fechaLocalISO(hoy)}.png`;

        $('repPreviewImg').src = _ultimoReporteDataUrl;
        $('repResultado').style.display = 'block';
    } catch (err) {
        alert('No se pudo generar el reporte: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '🖼️ Generar imagen';
    }
}

function descargarReporte() {
    if (!_ultimoReporteDataUrl) return;
    const a = document.createElement('a');
    a.href = _ultimoReporteDataUrl;
    a.download = _ultimoReporteNombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function compartirReporte() {
    if (!_ultimoReporteDataUrl) return;
    try {
        const blob = await (await fetch(_ultimoReporteDataUrl)).blob();
        const archivo = new File([blob], _ultimoReporteNombre, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
            await navigator.share({ files: [archivo], title: 'Estado de cuenta', text: 'Estado de cuenta - One Terra' });
        } else {
            descargarReporte();
            alert('Tu navegador no soporta compartir archivos directamente -- se descargó la imagen, compártela manualmente por WhatsApp o correo.');
        }
    } catch (err) {
        if (err.name !== 'AbortError') alert('No se pudo compartir: ' + err.message);
    }
}

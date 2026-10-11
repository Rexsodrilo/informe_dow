/* Dashboard: KPIs, detalles desplegables, gráficos y pestañas. Se usa en index.html y en la vista previa de cargador.html */
(function (g) {
  'use strict';
  const Dashboard = {};
  const C = { oliva: '#8A9577', salvia: '#B8C4A0', taupe: '#6B5D4B', arena: '#D6C7AA', musgo: '#2F3327', terra: '#A0522D', crema: '#EFE6D2' };
  const PALETA = [C.oliva, C.taupe, C.salvia, C.arena, C.musgo, C.terra];
  const META_INFULL = 0.98;
  const esc = DL.esc;
  const suma = (a, f) => a.reduce((x, y) => x + f(y), 0);
  const mediana = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const lunes = iso => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const sumaDias = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const difDias = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 864e5);

  /* ---------- Cálculo de indicadores ---------- */
  Dashboard.calc = function (d) {
    const hoy = d.meta.hoy, k = {};
    k.nvN = d.nv.length; k.bloq = d.nv.filter(x => x.bloq === 'Sí').length;
    k.valor = suma(d.nv, x => x.valor); k.mediana = mediana(d.nv.map(x => x.dias)); k.n30 = d.nv.filter(x => x.dias > 30).length;
    k.nvQ = d.nv.filter(x => x.quiebres > 0).length; k.lineasQ = d.quiebreLineas.length;
    const cm = d.cumplimiento.meses, i = cm.findIndex(m => m.mes === d.cumplimiento.mesCerrado);
    k.mes = i >= 0 ? cm[i] : null; k.mesPrev = i > 0 ? cm[i - 1] : null;
    if (k.mes) { k.inFull = k.mes.nv ? k.mes.completas / k.mes.nv : 0; k.pctAtraso = k.mes.nv ? k.mes.atraso / k.mes.nv : 0; }
    if (k.mesPrev) k.inFullPrev = k.mesPrev.nv ? k.mesPrev.completas / k.mesPrev.nv : 0;
    const v = d.ventas, vm = v.meses, vi = vm.findIndex(m => m.mes === v.mesCerrado);
    k.ventasAnio = suma(vm, m => m.total); k.ventasMes = vi >= 0 ? vm[vi] : null; k.ventasPrev = vi > 0 ? vm[vi - 1] : null;
    k.ventasVar = k.ventasMes && k.ventasPrev && k.ventasPrev.total ? k.ventasMes.total / k.ventasPrev.total - 1 : null;
    const ret = suma(vm, m => m.porCanal.RETAIL || 0); k.pctRetail = k.ventasAnio ? ret / k.ventasAnio : 0;
    const enCamino = d.arribos.filter(a => !a.llego);
    k.transito = suma(enCamino, a => a.unidades);
    k.venc = suma(enCamino.filter(a => a.arribo && a.arribo < hoy), a => a.unidades);
    k.invValor = suma(d.inventario, x => x.costoTotal); k.invSkus = d.inventario.length;
    k.stock0 = d.inventario.filter(x => x.stock <= 0 && x.rec > 0).length;
    k.skuQ = d.quiebreSku.length; k.skuQArribo = d.quiebreSku.filter(x => x.proxArribo).length;
    k.ocup = d.bodega.ocupacion;
    k.flotaNV = suma(d.flota.vehiculos, x => x.nv);
    const costo = suma(d.flota.vehiculos, x => x.combustible + x.mantencion); k.flotaCosto = costo; k.costoNV = k.flotaNV ? costo / k.flotaNV : null;
    return k;
  };

  function conclusion(d, k) {
    const p = [];
    p.push('Hay ' + DL.n(k.nvN) + ' NV abiertas por ' + DL.mm(k.valor) + ' por despachar; ' + DL.n(k.nvQ) + ' (' + DL.pct(k.nvN ? k.nvQ / k.nvN : 0, 0) + ') tienen al menos una línea en quiebre y ' + DL.n(k.bloq) + ' están bloqueadas.');
    if (k.mes) {
      let t = 'El % in full de ' + DL.mesLargo(k.mes.mes) + ' fue ' + DL.pct(k.inFull) + (k.inFull < META_INFULL ? ', bajo la meta de ' + DL.pct(META_INFULL, 0) : ', sobre la meta de ' + DL.pct(META_INFULL, 0));
      if (k.mesPrev) t += ' (' + DL.pp(k.inFull - k.inFullPrev) + ' frente a ' + DL.mesLargo(k.mesPrev.mes) + ')';
      p.push(t + '.');
    }
    p.push('Hay ' + DL.n(k.transito) + ' unidades en tránsito' + (k.venc ? ', de las cuales ' + DL.n(k.venc) + ' ya pasaron su fecha estimada de arribo' : '') + '.');
    return p.join(' ');
  }

  /* ---------- Definiciones de columnas ---------- */
  const colsNV = [
    { k: 'nv', t: 'NV' }, { k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'dias', t: 'Días', tipo: 'num' }, { k: 'cliente', t: 'Cliente' }, { k: 'vendedor', t: 'Vendedor' },
    { k: 'canal', t: 'Canal' }, { k: 'etapa', t: 'Etapa' }, { k: 'estadoDesp', t: 'Estado despacho' },
    { k: 'bloq', t: 'Bloqueada', cls: v => v === 'Sí' ? 'mal' : '' }, { k: 'lineas', t: 'Líneas', tipo: 'num' }, { k: 'quiebres', t: 'Líneas en quiebre', tipo: 'num' },
    { k: 'valor', t: 'Valor por despachar', tipo: 'clp' }, { k: 'zona', t: 'Zona logística' }];
  const colsQL = [
    { k: 'nv', t: 'NV' }, { k: 'cliente', t: 'Cliente' }, { k: 'sku', t: 'SKU' }, { k: 'producto', t: 'Producto' }, { k: 'pend', t: 'Cant. pendiente', tipo: 'num' },
    { k: 'valor', t: 'Valor línea', tipo: 'clp' }, { k: 'stock', t: 'Stock sistema', tipo: 'num', vacio: 'Sin dato' },
    { k: 'arribo', t: 'Próximo arribo', tipo: 'fecha', vacio: 'Sin arribo', cls: v => v ? '' : 'resalta' }];
  const colsQS = [
    { k: 'sku', t: 'SKU' }, { k: 'producto', t: 'Producto' }, { k: 'nv', t: 'NV', tipo: 'num' }, { k: 'unidades', t: 'Unidades pendientes', tipo: 'num' }, { k: 'valor', t: 'Valor líneas', tipo: 'clp' },
    { k: 'stock', t: 'Stock sistema', tipo: 'num', vacio: 'Sin dato' }, { k: 'proxArribo', t: 'Próximo arribo', tipo: 'fecha', vacio: 'Sin arribo', cls: v => v ? '' : 'resalta' },
    { k: 'enCamino', t: 'Unidades en camino', tipo: 'num' }];
  const colsInv = [
    { k: 'sku', t: 'SKU' }, { k: 'producto', t: 'Producto' }, { k: 'stock', t: 'Stock', tipo: 'num' }, { k: 'costoUnit', t: 'Costo unitario', tipo: 'clp' },
    { k: 'costoTotal', t: 'Costo total', tipo: 'clp' }, { k: 'rec', t: 'Recurrencia', tipo: 'num' }];
  const colsArr = [
    { k: 'eta', t: 'ETA puerto', tipo: 'fecha' }, { k: 'arribo', t: 'Arribo estimado', tipo: 'fecha' }, { k: 'sku', t: 'SKU' }, { k: 'desc', t: 'Descripción' },
    { k: 'unidades', t: 'Unidades', tipo: 'num' }, { k: 'estatus', t: 'Estatus' }, { k: 'diasAtraso', t: 'Días de atraso', tipo: 'num', cls: v => v > 0 ? 'mal' : '' }];

  /* ---------- Detalles (tablas que explican cada cifra) ---------- */
  function construirDetalles(d, k) {
    const hoy = d.meta.hoy, M = {};
    const T = (def, filas) => ({ def, filas });
    const nvT = (nombre, filas, orden, tot) => T({ nombre, cols: colsNV, orden, totales: tot ? { valor: 'sum', lineas: 'sum', quiebres: 'sum' } : null }, filas);
    const sob = f => ({ valor: f });
    M.nv_abiertas = { titulo: 'NV abiertas', valor: DL.n(k.nvN), como: 'NV distintas con estado "A" (abierta) en la hoja Corte.', tablas: [nvT('NV abiertas', d.nv, { k: 'dias', dir: 'desc' })] };
    M.nv_bloq = { titulo: 'NV bloqueadas', valor: DL.n(k.bloq), como: 'NV abiertas con al menos una línea con Bloqueado = "S".', tablas: [nvT('NV bloqueadas', d.nv.filter(x => x.bloq === 'Sí'), { k: 'dias', dir: 'desc' })] };
    M.nv_antig = { titulo: 'Antigüedad de las NV abiertas', valor: DL.n(k.mediana, 0) + ' días (mediana)', como: 'Mediana de los días de antigüedad (máximo de "Dias NV" por NV) de las NV abiertas.', tablas: [nvT('NV abiertas por antigüedad', d.nv, { k: 'dias', dir: 'desc' })] };
    M.nv_30 = { titulo: 'NV abiertas con más de 30 días', valor: DL.n(k.n30), como: 'NV abiertas cuya antigüedad es mayor a 30 días.', tablas: [nvT('NV de más de 30 días', d.nv.filter(x => x.dias > 30), { k: 'dias', dir: 'desc' })] };
    M.nv_valor = { titulo: 'Valor por despachar', valor: DL.mm(k.valor), como: 'Suma de "Valor SdespNV" de las líneas de NV abiertas; la tabla va ordenada por valor.', tablas: [nvT('Valor por despachar por NV', d.nv, { k: 'valor', dir: 'desc' }, true)] };
    const ql = { nombre: 'Líneas abiertas en quiebre', cols: colsQL, orden: { k: 'valor', dir: 'desc' }, totales: { valor: 'sum', pend: 'sum' } };
    M.quiebre_nv = { titulo: 'NV con quiebre', valor: DL.n(k.nvQ), como: 'NV abiertas con al menos una línea con ES_INV = QUIEBRE. Se listan sus líneas en quiebre.', tablas: [T(ql, d.quiebreLineas)] };
    M.quiebre_lin = { titulo: 'Líneas sin stock', valor: DL.n(k.lineasQ), como: 'Líneas de NV abiertas con ES_INV = QUIEBRE. El stock es el de "INV sistema" (foto al corte).', tablas: [T(ql, d.quiebreLineas)] };
    // cumplimiento
    const mesesRows = d.cumplimiento.meses.map(m => ({ mes: DL.mesLargo(m.mes), mesK: m.mes, nv: m.nv, completas: m.completas, parciales: m.parciales, pctFull: m.nv ? m.completas / m.nv : 0, prom: m.prom, atraso: m.atraso, pctAtraso: m.nv ? m.atraso / m.nv : 0 }));
    const cumplT = [T({ nombre: 'Cumplimiento mensual (' + d.meta.anio + ')', cols: [{ k: 'mes', t: 'Mes' }, { k: 'nv', t: 'NV', tipo: 'num' }, { k: 'completas', t: 'Completas', tipo: 'num' }, { k: 'parciales', t: 'Parciales', tipo: 'num' },
      { k: 'pctFull', t: '% in full', tipo: 'pct' }, { k: 'prom', t: 'Ítems atendidos (prom.)', tipo: 'pct' }, { k: 'atraso', t: 'Con atraso', tipo: 'num' }, { k: 'pctAtraso', t: '% con atraso', tipo: 'pct' }],
      }, mesesRows),
      T({ nombre: 'NV parciales o con atraso – ' + (k.mes ? DL.mesLargo(k.mes.mes) : ''), hoja: 'NV parciales o atraso', cols: [{ k: 'nv', t: 'NV' }, { k: 'cliente', t: 'Cliente' }, { k: 'fecha', t: 'Fecha', tipo: 'fecha' },
        { k: 'cumInv', t: 'Cum_inv%', tipo: 'pct' }, { k: 'diasEntreg', t: 'Días entrega', tipo: 'num', cls: v => v > 0 ? 'mal' : '' }, { k: 'estado', t: 'Estado' }, { k: 'proceso', t: 'Proceso' }],
        orden: { k: 'cumInv', dir: 'asc' } }, d.cumplimiento.detalle)];
    const comoC = 'Hoja Desp, estados C/A/P, año ' + d.meta.anio + ', por mes de F_Crea. Completa = Cum _inv% ≥ 100%; con atraso = Dias_entreg > 0. Último mes cerrado = penúltimo mes con datos.';
    M.cumpl_nv = { titulo: 'NV despachadas', valor: k.mes ? DL.n(k.mes.nv) : '–', como: comoC, tablas: cumplT };
    M.cumpl_full = { titulo: '% in full', valor: k.mes ? DL.pct(k.inFull) : '–', como: comoC, tablas: cumplT };
    M.cumpl_items = { titulo: 'Ítems atendidos', valor: k.mes ? DL.pct(k.mes.prom) : '–', como: comoC + ' Ítems atendidos = promedio de Cum _inv%.', tablas: cumplT };
    M.cumpl_atraso = { titulo: 'NV con atraso', valor: k.mes ? DL.n(k.mes.atraso) : '–', como: comoC, tablas: cumplT };
    // ventas
    const can = d.ventas.canales;
    const vRows = d.ventas.meses.map(m => Object.assign({ mes: DL.mesLargo(m.mes), total: m.total }, m.porCanal));
    const nombreCanal = c => c.charAt(0) + c.slice(1).toLowerCase();
    const totAn = k.ventasAnio;
    const ventasT = [T({ nombre: 'Ventas por mes y canal', cols: [{ k: 'mes', t: 'Mes' }].concat(can.map(c => ({ k: c, t: nombreCanal(c), tipo: 'clp' })), [{ k: 'total', t: 'Total', tipo: 'clp' }]),
      totales: Object.assign({ total: 'sum' }, ...can.map(c => ({ [c]: 'sum' }))) }, vRows),
      T({ nombre: 'Ventas por vendedor', cols: [{ k: 'vendedor', t: 'Vendedor' }, { k: 'total', t: 'Ventas', tipo: 'clp' }, { k: 'part', t: 'Participación', tipo: 'pct' }],
        orden: { k: 'total', dir: 'desc' }, totales: { total: 'sum' } }, d.ventas.vendedores.map(v => ({ vendedor: v.vendedor, total: v.total, part: totAn ? v.total / totAn : 0 })))];
    const comoV = 'Suma de nvTotLinea de líneas con nvEstado C, A o P (sin N) y Fec_Cre en ' + d.meta.anio + ', agrupada por mes y canal y por vendedor.';
    M.ventas_anio = { titulo: 'Ventas del año', valor: DL.mm(k.ventasAnio), como: comoV, tablas: ventasT };
    M.ventas_mes = { titulo: 'Ventas del último mes cerrado', valor: k.ventasMes ? DL.mm(k.ventasMes.total) : '–', como: comoV, tablas: ventasT };
    M.ventas_retail = { titulo: '% Retail', valor: DL.pct(k.pctRetail), como: comoV + ' % Retail = ventas del canal RETAIL / ventas totales.', tablas: ventasT };
    M.ventas_nv = { titulo: 'NV emitidas', valor: DL.n(d.ventas.nvEmitidas), como: comoV + ' NV emitidas = NV distintas con esas líneas.', tablas: ventasT };
    // inventario
    const invT = (nombre, filas) => T({ nombre, cols: colsInv, orden: { k: 'costoTotal', dir: 'desc' }, totales: { costoTotal: 'sum' } }, filas);
    M.inv_valor = { titulo: 'Valor del inventario', valor: DL.mm(k.invValor), como: 'Suma de "Costo Total" de la hoja INV sistema (foto al corte).', tablas: [invT('Inventario del sistema', d.inventario)] };
    M.inv_skus = { titulo: 'SKUs en inventario', valor: DL.n(k.invSkus), como: 'Productos listados en la hoja INV sistema.', tablas: [invT('Inventario del sistema', d.inventario)] };
    M.inv_stock0 = { titulo: 'SKUs con stock 0 y demanda', valor: DL.n(k.stock0), como: 'SKUs de INV sistema con stock ≤ 0 y recurrencia > 0.', tablas: [T({ nombre: 'Stock 0 con demanda', cols: colsInv, orden: { k: 'rec', dir: 'desc' } }, d.inventario.filter(x => x.stock <= 0 && x.rec > 0))] };
    M.quiebre_sku = { titulo: 'SKUs en quiebre', valor: DL.n(k.skuQ) + ' (' + DL.n(k.skuQArribo) + ' con arribo)', como: 'SKUs con líneas abiertas en QUIEBRE. Próximo arribo = fecha estimada más cercana de Arribos sin llegada "SI".', tablas: [T({ nombre: 'SKUs en quiebre', cols: colsQS, orden: { k: 'valor', dir: 'desc' }, totales: { valor: 'sum', unidades: 'sum', enCamino: 'sum' } }, d.quiebreSku)] };
    const arrRows = d.arribos.filter(a => !a.llego).map(a => Object.assign({}, a, { diasAtraso: a.arribo && a.arribo < hoy ? difDias(hoy, a.arribo) : 0 }));
    const arrT = (nombre, f) => T({ nombre, cols: colsArr, orden: { k: 'arribo', dir: 'asc' }, totales: { unidades: 'sum' } }, f);
    M.arr_transito = { titulo: 'Unidades en tránsito', valor: DL.n(k.transito), como: 'Suma de Unidades de la hoja Arribos con "Arribo?" distinto de SI.', tablas: [arrT('Arribos en tránsito', arrRows)] };
    M.arr_vencidas = { titulo: 'Unidades vencidas', valor: DL.n(k.venc), como: 'Unidades en tránsito cuyo arribo estimado es anterior a la fecha de los datos (' + DL.fecha(hoy) + ').', tablas: [arrT('Arribos vencidos', arrRows.filter(a => a.diasAtraso > 0))] };
    M.bodega = { titulo: 'Ocupación de bodega', valor: DL.pct(k.ocup), como: 'Metros cuadrados utilizados / metros cuadrados totales (hoja Bodega M2; los pasillos repetidos se suman).',
      tablas: [T({ nombre: 'Ocupación por pasillo', cols: [{ k: 'pasillo', t: 'Pasillo' }, { k: 'm2', t: 'M2', tipo: 'dec' }, { k: 'utilizado', t: 'Utilizado (M2)', tipo: 'dec' }, { k: 'utilizable', t: 'Utilizable (M2)', tipo: 'dec' },
        { k: 'ocupacion', t: 'Ocupación', tipo: 'pct', cls: v => v >= 1 ? 'resalta' : '' }], orden: { k: 'ocupacion', dir: 'desc' }, totales: { m2: 'sum', utilizado: 'sum', utilizable: 'sum', ocupacion: DL.pct(k.ocup) } }, d.bodega.pasillos)] };
    const flotaT = [T({ nombre: 'Flota por vehículo', cols: [{ k: 'patente', t: 'Patente' }, { k: 'tipo', t: 'Tipo' }, { k: 'operador', t: 'Operador' }, { k: 'dias', t: 'Días con registro', tipo: 'num' }, { k: 'uso', t: 'Uso total (km/horas)', tipo: 'dec' },
      { k: 'nv', t: 'NV entregadas', tipo: 'num' }, { k: 'combustible', t: 'Combustible', tipo: 'clp' }, { k: 'mantencion', t: 'Mantención', tipo: 'clp' }, { k: 'costoNV', t: 'Costo por NV', tipo: 'clp', vacio: 'Sin NV' },
      { k: 'viajes', t: 'Viajes', tipo: 'num' }, { k: 'minProm', t: 'Min. promedio por viaje', tipo: 'num', vacio: 'Sin dato' }], orden: { k: 'nv', dir: 'desc' }, totales: { nv: 'sum', combustible: 'sum', mantencion: 'sum', viajes: 'sum', dias: 'sum' } }, d.flota.vehiculos),
      T({ nombre: 'Registro diario', cols: [{ k: 'fecha', t: 'Fecha', tipo: 'fecha' }, { k: 'patente', t: 'Patente' }, { k: 'operador', t: 'Operador' }, { k: 'uso', t: 'Uso (km/horas)', tipo: 'dec' }, { k: 'nv', t: 'NV entregadas', tipo: 'num' }],
        orden: { k: 'fecha', dir: 'desc' }, totales: { uso: 'sum', nv: 'sum' } }, d.flota.diario)];
    const comoF = 'Cont_Hodo: días con registro, uso y NV entregadas por patente. Costo por NV = (combustible + mantención) / NV entregadas. Viajes y minutos promedio salen de Horario_Trans.';
    M.flota_nv = { titulo: 'NV entregadas por la flota', valor: DL.n(k.flotaNV), como: comoF, tablas: flotaT };
    M.flota_costo = { titulo: 'Costo por NV', valor: k.costoNV == null ? '–' : DL.clp(k.costoNV), como: comoF, tablas: flotaT };
    M.flota_veh = { titulo: 'Vehículos', valor: DL.n(d.flota.vehiculos.length), como: comoF, tablas: flotaT };
    return M;
  }
  const ORDEN_TODO = ['nv_abiertas', 'nv_bloq', 'nv_30', 'nv_valor', 'quiebre_lin', 'cumpl_full', 'ventas_anio', 'inv_valor', 'inv_stock0', 'quiebre_sku', 'arr_transito', 'arr_vencidas', 'bodega', 'flota_nv'];

  /* ---------- Gráficos (Chart.js) ---------- */
  function configurarChart() {
    if (!g.Chart || Chart._dl) return; Chart._dl = true;
    Chart.defaults.font.family = '"Nunito Sans",system-ui,sans-serif'; Chart.defaults.font.size = 12; Chart.defaults.color = C.musgo;
    Chart.defaults.borderColor = 'rgba(214,199,170,.9)';
    Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor: C.crema, titleColor: C.musgo, bodyColor: C.musgo, borderColor: C.oliva, borderWidth: 1, padding: 10, cornerRadius: 8, boxPadding: 4 });
    Chart.defaults.plugins.legend.labels.color = C.musgo;
    Chart.defaults.maintainAspectRatio = false;
  }
  const escala = (extra) => Object.assign({ grid: { color: C.arena }, ticks: { color: C.taupe } }, extra || {});

  /* ---------- Montaje ---------- */
  let contador = 0;
  Dashboard.mount = function (root, d, opt) {
    opt = opt || {}; configurarChart();
    const uid = 'db' + (++contador) + '_';
    const k = Dashboard.calc(d), DET = construirDetalles(d, k), charts = [];
    const hoy = d.meta.hoy;
    let abierto = null;
    root.innerHTML =
      '<header class="top"><div><h1>Downlight · Control logístico</h1><div class="meta">Datos actualizados: ' + esc(DL.fechaHora(d.meta.generado)) + ' · archivo ' + esc(d.meta.archivo) + '</div></div>' +
      '<div class="acciones"><button type="button" class="btn" data-a="todo">Descargar todo en Excel</button>' + (opt.logout ? '<button type="button" class="btn sec" data-a="salir">Cerrar sesión</button>' : '') + '</div></header>' +
      '<nav class="tabs" role="tablist" aria-label="Secciones"></nav><div class="paneles"></div>';
    const nav = root.querySelector('.tabs'), pans = root.querySelector('.paneles');

    function kpi(tab, key, titulo, cifra, sub, o) {
      o = o || {}; const id = uid + tab + '-' + key + (o.n || '');
      return '<article class="card kpi' + (o.alerta ? ' alerta' : '') + '"><h3>' + esc(titulo) + '</h3><div class="cifra">' + esc(cifra) + '</div><div class="sub">' + (sub || '') + '</div>' +
        '<button type="button" class="btn sec peque" data-det="' + key + '" data-panel="' + uid + tab + '-det" aria-expanded="false" aria-controls="' + uid + tab + '-det">Ver detalle ▾</button></article>';
    }
    const cardG = (titulo, id, alto) => '<section class="card"><h2>' + esc(titulo) + '</h2><div class="grafico' + (alto ? ' alto' : '') + '"><canvas id="' + uid + id + '" role="img" aria-label="' + esc(titulo) + '"></canvas></div></section>';
    const panel = tab => '<div class="detalle" id="' + uid + tab + '-det" role="region" aria-label="Detalle"></div>';
    const cv = id => root.querySelector('#' + uid + id);
    const mkChart = (id, cfg) => { const c = new Chart(cv(id), cfg); charts.push(c); return c; };
    const barras = (etq, datos, color, horiz, extra) => ({ type: 'bar', data: { labels: etq, datasets: [Object.assign({ data: datos, backgroundColor: color || C.oliva, borderColor: C.taupe, borderWidth: 1, borderRadius: 4 }, extra || {})] },
      options: { indexAxis: horiz ? 'y' : 'x', plugins: { legend: { display: false } }, scales: { x: escala(horiz ? { beginAtZero: true } : { grid: { display: false } }), y: escala(horiz ? { grid: { display: false } } : { beginAtZero: true }) } } });
    const cuentaPor = (arr, f) => { const m = new Map(); arr.forEach(x => { const v = f(x); m.set(v, (m.get(v) || 0) + 1); }); return Array.from(m, ([n, c]) => ({ n, c })).sort((a, b) => b.c - a.c); };
    const etapas = cuentaPor(d.nv, x => x.etapa);
    const subVar = (v, inv) => v == null ? '' : '<span class="' + ((inv ? v > 0 : v < 0) ? 'var-mal' : 'var-bien') + '">' + (v >= 0 ? '▲ ' : '▼ ') + DL.pp(v) + '</span>';

    const tabs = [];
    /* 1. Resumen */
    tabs.push({ id: 'resumen', t: 'Resumen', html: () =>
      '<p class="card conclusion">' + esc(conclusion(d, k)) + '</p><div class="kpis">' +
      kpi('r', 'nv_abiertas', 'NV abiertas', DL.n(k.nvN), 'Valor ' + DL.mm(k.valor)) + kpi('r', 'nv_bloq', 'NV bloqueadas', DL.n(k.bloq), DL.pct(k.nvN ? k.bloq / k.nvN : 0) + ' de las abiertas') +
      kpi('r', 'nv_valor', 'Valor por despachar', DL.mm(k.valor), 'Líneas de NV abiertas') + kpi('r', 'quiebre_nv', 'NV con quiebre', DL.n(k.nvQ), DL.pct(k.nvN ? k.nvQ / k.nvN : 0, 0) + ' de las abiertas', { alerta: true }) +
      kpi('r', 'quiebre_lin', 'Líneas sin stock', DL.n(k.lineasQ), DL.n(k.skuQ) + ' SKUs en quiebre', { alerta: true }) +
      (k.mes ? kpi('r', 'cumpl_full', '% in full ' + DL.mesNombre(k.mes.mes), DL.pct(k.inFull), (k.mesPrev ? DL.mesNombre(k.mesPrev.mes) + ' ' + DL.pct(k.inFullPrev) + ' · ' : '') + (k.mesPrev ? subVar(k.inFull - k.inFullPrev) : ''), { alerta: k.inFull < META_INFULL }) : '') +
      kpi('r', 'ventas_anio', 'Ventas ' + d.meta.anio, DL.mm(k.ventasAnio), DL.pct(k.pctRetail) + ' Retail') +
      kpi('r', 'arr_transito', 'Unidades en tránsito', DL.n(k.transito), 'Arribos sin llegada') + kpi('r', 'arr_vencidas', 'Unidades vencidas', DL.n(k.venc), 'Pasaron su arribo estimado', { alerta: k.venc > 0 }) +
      '</div>' + panel('r') + '<div class="grid2">' + cardG('NV por mes: completas vs parciales', 'r1') + cardG('NV abiertas por etapa', 'r2') + cardG('Ocupación de bodega', 'r3') + '</div>',
      draw: () => {
        const m = d.cumplimiento.meses;
        mkChart('r1', { type: 'bar', data: { labels: m.map(x => DL.mesNombre(x.mes)), datasets: [{ label: 'Completas', data: m.map(x => x.completas), backgroundColor: C.oliva }, { label: 'Parciales', data: m.map(x => x.parciales), backgroundColor: C.terra }] },
          options: { scales: { x: escala({ stacked: true, grid: { display: false } }), y: escala({ stacked: true, beginAtZero: true }) } } });
        mkChart('r2', barras(etapas.map(x => x.n), etapas.map(x => x.c), C.salvia, true));
        mkChart('r3', { type: 'doughnut', data: { labels: ['Utilizado', 'Disponible'], datasets: [{ data: [d.bodega.utilizado, Math.max(d.bodega.m2 - d.bodega.utilizado, 0)], backgroundColor: [C.oliva, C.arena], borderColor: C.taupe, borderWidth: 1 }] },
          options: { cutout: '62%', plugins: { tooltip: { callbacks: { label: c => ' ' + c.label + ': ' + DL.n(c.raw, 1) + ' m² (' + DL.pct(c.raw / d.bodega.m2) + ')' } } } } });
      } });
    /* 2. Pedidos pendientes */
    const buckets = [['0–7 días', 0, 7], ['8–30 días', 8, 30], ['31–90 días', 31, 90], ['91–180 días', 91, 180], ['Más de 180 días', 181, 1e9]].map(b => ({ n: b[0], c: d.nv.filter(x => x.dias >= b[1] && x.dias <= b[2]).length }));
    const vend = cuentaPor(d.nv, x => x.vendedor).slice(0, 10), zonas = cuentaPor(d.nv, x => x.zona), zTop = zonas.slice(0, 12);
    if (zonas.length > 12) zTop.push({ n: 'Otras zonas', c: suma(zonas.slice(12), z => z.c) });
    tabs.push({ id: 'pedidos', t: 'Pedidos pendientes', html: () =>
      '<div class="kpis">' + kpi('p', 'nv_abiertas', 'NV abiertas', DL.n(k.nvN), DL.n(k.bloq) + ' bloqueadas') + kpi('p', 'nv_valor', 'Valor por despachar', DL.mm(k.valor), 'Suma de líneas abiertas') +
      kpi('p', 'nv_antig', 'Antigüedad mediana', DL.n(k.mediana, 0) + ' días', 'Mitad de las NV es más antigua') + kpi('p', 'nv_30', 'NV con más de 30 días', DL.n(k.n30), DL.pct(k.nvN ? k.n30 / k.nvN : 0, 0) + ' de las abiertas', { alerta: k.n30 > 0 }) + '</div>' + panel('p') +
      '<div class="grid2">' + cardG('NV abiertas por etapa', 'p1') + cardG('NV abiertas por antigüedad', 'p2') + cardG('Vendedores con más NV abiertas (top 10)', 'p3') + cardG('NV abiertas por zona logística', 'p4') + '</div>' +
      '<section class="card"><h2>Todas las NV abiertas</h2><div id="' + uid + 'p-tabla"></div></section>',
      draw: () => {
        mkChart('p1', barras(etapas.map(x => x.n), etapas.map(x => x.c), C.salvia, true));
        mkChart('p2', barras(buckets.map(x => x.n), buckets.map(x => x.c), buckets.map((x, i) => i >= 2 ? C.terra : C.oliva)));
        mkChart('p3', barras(vend.map(x => x.n), vend.map(x => x.c), C.oliva, true));
        mkChart('p4', barras(zTop.map(x => x.n), zTop.map(x => x.c), C.taupe, true));
        DL.tabla(cv('p-tabla'), { nombre: 'NV abiertas', cols: colsNV, filas: d.nv, orden: { k: 'dias', dir: 'desc' } }, { titulo: false });
      } });
    /* 3. Despachos */
    const cm = d.cumplimiento.meses;
    const top = (arr, n) => arr.slice(0, n || 10);
    tabs.push({ id: 'despachos', t: 'Despachos', html: () =>
      (k.mes ? '<div class="kpis">' + kpi('d', 'cumpl_nv', 'NV despachadas · ' + DL.mesNombre(k.mes.mes), DL.n(k.mes.nv), DL.n(k.mes.completas) + ' completas · ' + DL.n(k.mes.parciales) + ' parciales') +
        kpi('d', 'cumpl_full', '% in full', DL.pct(k.inFull), 'Meta ' + DL.pct(META_INFULL, 0) + (k.mesPrev ? ' · ' + subVar(k.inFull - k.inFullPrev) : ''), { alerta: k.inFull < META_INFULL }) +
        kpi('d', 'cumpl_items', 'Ítems atendidos', DL.pct(k.mes.prom), 'Promedio de Cum _inv%') +
        kpi('d', 'cumpl_atraso', 'NV con atraso', DL.n(k.mes.atraso), DL.pct(k.pctAtraso) + ' de las despachadas', { alerta: k.pctAtraso > 0.02 }) + '</div>' + panel('d') : '<p class="card">Sin datos de despacho para ' + d.meta.anio + '.</p>') +
      '<div class="grid2">' + '<section class="card ancha"><h2>% in full y % con atraso por mes (meta 98%)</h2><div class="grafico"><canvas id="' + uid + 'd1" role="img" aria-label="% in full y % con atraso por mes"></canvas></div></section>' +
      cardG('NV por conductor (top 10, ' + d.meta.anio + ')', 'd2') + cardG('NV por picking (top 10)', 'd3') + cardG('NV por auditor (top 10)', 'd4') + '</div>',
      draw: () => {
        mkChart('d1', { type: 'line', data: { labels: cm.map(x => DL.mesNombre(x.mes)), datasets: [
          { label: '% in full', data: cm.map(x => x.nv ? x.completas / x.nv * 100 : null), borderColor: C.oliva, backgroundColor: C.oliva, tension: .25, pointRadius: 4 },
          { label: '% con atraso', data: cm.map(x => x.nv ? x.atraso / x.nv * 100 : null), borderColor: C.terra, backgroundColor: C.terra, tension: .25, pointRadius: 4 },
          { label: 'Meta 98%', data: cm.map(() => 98), borderColor: C.taupe, borderDash: [6, 5], pointRadius: 0, borderWidth: 2 }] },
          options: { scales: { x: escala({ grid: { display: false } }), y: escala({ min: 0, max: 100, ticks: { color: C.taupe, callback: v => v + '%' } }) },
            plugins: { tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': ' + DL.n(c.raw, 1) + '%' } } } } });
        const eq = d.equipo;
        mkChart('d2', barras(top(eq.chofer).map(x => x.n), top(eq.chofer).map(x => x.nv), C.oliva, true));
        mkChart('d3', barras(top(eq.picking).map(x => x.n), top(eq.picking).map(x => x.nv), C.salvia, true));
        mkChart('d4', barras(top(eq.auditor).map(x => x.n), top(eq.auditor).map(x => x.nv), C.taupe, true));
      } });
    /* 4. Ventas */
    const vm = d.ventas.meses, can = d.ventas.canales, vTop = d.ventas.vendedores.slice(0, 12);
    tabs.push({ id: 'ventas', t: 'Ventas', html: () =>
      '<div class="kpis">' + kpi('v', 'ventas_anio', 'Ventas ' + d.meta.anio, DL.mm(k.ventasAnio), 'Año en curso') +
      kpi('v', 'ventas_mes', 'Último mes cerrado' + (k.ventasMes ? ' · ' + DL.mesNombre(k.ventasMes.mes) : ''), k.ventasMes ? DL.mm(k.ventasMes.total) : '–',
        k.ventasVar == null ? '' : '<span class="' + (k.ventasVar < 0 ? 'var-mal' : 'var-bien') + '">' + (k.ventasVar >= 0 ? '▲ ' : '▼ ') + DL.n(Math.abs(k.ventasVar) * 100, 1) + '%</span> vs ' + DL.mesNombre(k.ventasPrev.mes)) +
      kpi('v', 'ventas_retail', '% Retail', DL.pct(k.pctRetail), 'Del total del año') + kpi('v', 'ventas_nv', 'NV emitidas', DL.n(d.ventas.nvEmitidas), 'En ' + d.meta.anio) + '</div>' + panel('v') +
      '<div class="grid2">' + '<section class="card ancha"><h2>Ventas por mes y canal ($ millones)</h2><div class="grafico alto"><canvas id="' + uid + 'v1" role="img" aria-label="Ventas por mes y canal"></canvas></div></section>' +
      cardG('Ventas por vendedor (top 12, $ millones)', 'v2', true) + '<section class="card"><h2>Top 30 productos del año</h2><div id="' + uid + 'v-tabla"></div></section></div>',
      draw: () => {
        mkChart('v1', { type: 'bar', data: { labels: vm.map(x => DL.mesNombre(x.mes)), datasets: can.map((c, i) => ({ label: c.charAt(0) + c.slice(1).toLowerCase(), data: vm.map(x => (x.porCanal[c] || 0) / 1e6), backgroundColor: PALETA[i % PALETA.length], borderColor: C.taupe, borderWidth: 1 })) },
          options: { scales: { x: escala({ stacked: true, grid: { display: false } }), y: escala({ stacked: true, beginAtZero: true, ticks: { color: C.taupe, callback: v => DL.n(v) } }) },
            plugins: { tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ': $' + DL.n(c.raw, 0) + ' M' } } } } });
        const c2 = mkChart('v2', barras(vTop.map(x => x.vendedor), vTop.map(x => x.total / 1e6), C.oliva, true));
        c2.options.plugins.tooltip.callbacks = { label: c => ' $' + DL.n(c.raw, 0) + ' M' };
        DL.tabla(cv('v-tabla'), { nombre: 'Top 30 productos', cols: [{ k: 'sku', t: 'SKU' }, { k: 'producto', t: 'Producto' }, { k: 'unidades', t: 'Unidades', tipo: 'num' }, { k: 'nv', t: 'NV', tipo: 'num' }, { k: 'ventas', t: 'Ventas', tipo: 'clp' }],
          filas: d.ventas.top, orden: { k: 'ventas', dir: 'desc' }, totales: { ventas: 'sum', unidades: 'sum' } }, { titulo: false });
      } });
    /* 5. Inventario y arribos */
    const sem = new Map();
    d.arribos.filter(a => !a.llego && a.arribo).forEach(a => { const w = lunes(a.arribo); sem.set(w, (sem.get(w) || 0) + a.unidades); });
    const semK = Array.from(sem.keys()).sort(), invTop = d.inventario.slice().sort((a, b) => b.costoTotal - a.costoTotal).slice(0, 15);
    tabs.push({ id: 'inventario', t: 'Inventario y arribos', html: () =>
      '<div class="kpis">' + kpi('i', 'inv_valor', 'Valor del inventario', DL.mm(k.invValor), 'Costo total al corte') + kpi('i', 'inv_skus', 'SKUs', DL.n(k.invSkus), 'En INV sistema') +
      kpi('i', 'inv_stock0', 'Stock 0 con demanda', DL.n(k.stock0), 'Stock ≤ 0 y recurrencia > 0', { alerta: k.stock0 > 0 }) + kpi('i', 'quiebre_sku', 'SKUs en quiebre', DL.n(k.skuQ), DL.n(k.skuQArribo) + ' con arribo · ' + DL.n(k.skuQ - k.skuQArribo) + ' sin arribo', { alerta: true }) +
      kpi('i', 'arr_transito', 'Unidades en tránsito', DL.n(k.transito), 'Arribos sin llegada') + kpi('i', 'arr_vencidas', 'Unidades vencidas', DL.n(k.venc), 'Pasaron su arribo estimado', { alerta: k.venc > 0 }) + '</div>' + panel('i') +
      '<section class="card"><h2>Quiebres por SKU</h2><div id="' + uid + 'i-tabla"></div></section><div class="grid2" style="margin-top:1rem">' +
      cardG('Unidades por semana de arribo estimado (semanas vencidas en terracota)', 'i1', true) + cardG('Top 15 capital inmovilizado ($ millones)', 'i2', true) + '</div>',
      draw: () => {
        DL.tabla(cv('i-tabla'), { nombre: 'SKUs en quiebre', cols: colsQS, filas: d.quiebreSku, orden: { k: 'valor', dir: 'desc' } }, { titulo: false });
        const c1 = mkChart('i1', barras(semK.map(w => 'Sem. ' + DL.fecha(w).replace(/ \d{4}$/, '')), semK.map(w => sem.get(w)), semK.map(w => sumaDias(w, 6) < hoy ? C.terra : C.oliva)));
        c1.options.plugins.tooltip.callbacks = { title: i => 'Semana del ' + DL.fecha(semK[i[0].dataIndex]), label: c => ' ' + DL.n(c.raw) + ' unidades' + (sumaDias(semK[c.dataIndex], 6) < hoy ? ' (vencida)' : '') };
        const c2 = mkChart('i2', barras(invTop.map(x => x.producto.slice(0, 34)), invTop.map(x => x.costoTotal / 1e6), C.taupe, true));
        c2.options.plugins.tooltip.callbacks = { title: i => invTop[i[0].dataIndex].producto, label: c => ' $' + DL.n(c.raw, 1) + ' M · stock ' + DL.n(invTop[c.dataIndex].stock) };
      } });
    /* 6. Flota y bodega */
    const dias = Array.from(new Set(d.flota.diario.map(x => x.fecha))).sort(), pats = d.flota.vehiculos.filter(v => v.nv > 0 || v.dias > 0).map(v => v.patente);
    tabs.push({ id: 'flota', t: 'Flota y bodega', html: () =>
      '<div class="kpis">' + kpi('f', 'flota_nv', 'NV entregadas por la flota', DL.n(k.flotaNV), DL.n(d.flota.vehiculos.length) + ' vehículos') +
      kpi('f', 'flota_costo', 'Costo por NV', k.costoNV == null ? '–' : DL.clp(k.costoNV), 'Combustible + mantención ' + DL.mm(k.flotaCosto)) +
      kpi('f', 'bodega', 'Ocupación de bodega', DL.pct(k.ocup), DL.n(d.bodega.utilizado, 0) + ' de ' + DL.n(d.bodega.m2, 0) + ' m²') + '</div>' + panel('f') +
      '<section class="card"><h2>Flota por vehículo</h2><div id="' + uid + 'f-tabla"></div></section><div class="grid2" style="margin-top:1rem">' +
      cardG('NV entregadas por día y vehículo', 'f1', true) + cardG('Ocupación por pasillo (al 100% en terracota)', 'f2', true) + '</div>',
      draw: () => {
        DL.tabla(cv('f-tabla'), DET.flota_veh.tablas[0].def && Object.assign({}, DET.flota_veh.tablas[0].def, { filas: d.flota.vehiculos }), { titulo: false });
        mkChart('f1', { type: 'bar', data: { labels: dias.map(x => DL.fecha(x).replace(/ \d{4}$/, '')), datasets: pats.map((p, i) => ({ label: p, backgroundColor: PALETA[i % PALETA.length], borderColor: C.taupe, borderWidth: 1,
          data: dias.map(dd => suma(d.flota.diario.filter(r => r.fecha === dd && r.patente === p), r => r.nv)) })) },
          options: { scales: { x: escala({ stacked: true, grid: { display: false } }), y: escala({ stacked: true, beginAtZero: true }) } } });
        const ps = d.bodega.pasillos;
        const c2 = mkChart('f2', barras(ps.map(x => x.pasillo), ps.map(x => x.ocupacion * 100), ps.map(x => x.ocupacion >= 1 ? C.terra : C.oliva)));
        c2.options.scales.y.max = 100; c2.options.scales.y.ticks.callback = v => v + '%';
        c2.options.plugins.tooltip.callbacks = { label: c => ' ' + DL.n(c.raw, 1) + '% · ' + DL.n(ps[c.dataIndex].utilizado, 1) + ' de ' + DL.n(ps[c.dataIndex].m2, 1) + ' m²' };
      } });

    /* ---- pestañas ---- */
    nav.innerHTML = tabs.map((t, i) => '<button type="button" class="tab" role="tab" id="' + uid + 'tab' + i + '" aria-selected="false" aria-controls="' + uid + 'pan' + i + '" tabindex="-1">' + esc(t.t) + '</button>').join('');
    pans.innerHTML = tabs.map((t, i) => '<section class="oculto" role="tabpanel" id="' + uid + 'pan' + i + '" aria-labelledby="' + uid + 'tab' + i + '"></section>').join('');
    function activar(i) {
      cerrarDetalle();
      tabs.forEach((t, j) => {
        const b = nav.children[j], p = pans.children[j], on = i === j;
        b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; p.classList.toggle('oculto', !on);
        if (on && !t.hecho) { p.innerHTML = t.html(); t.hecho = true; try { t.draw(); } catch (e) { console.error(e); } }
      });
      charts.forEach(c => { try { c.resize(); } catch (e) { /* nada */ } });
      try { DL.ls.set('dl_tab', String(i)); } catch (e) { /* nada */ }
    }
    nav.addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) activar(Array.prototype.indexOf.call(nav.children, b)); });
    nav.addEventListener('keydown', e => {
      const i = Array.prototype.indexOf.call(nav.children, document.activeElement); if (i < 0) return;
      let j = e.key === 'ArrowRight' ? (i + 1) % tabs.length : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length : -1;
      if (j >= 0) { e.preventDefault(); activar(j); nav.children[j].focus(); }
    });

    /* ---- detalles desplegables ---- */
    function infoHoja(det) {
      return [['Indicador', det.titulo], ['Valor mostrado', det.valor], ['Cómo se calcula', det.como], ['Fecha de los datos', DL.fechaHora(d.meta.generado)], ['Archivo de origen', d.meta.archivo]];
    }
    function cerrarDetalle() {
      if (!abierto) return;
      const p = root.querySelector('#' + abierto.panel); if (p) { p.classList.remove('abierto'); const pp = p; setTimeout(() => { if (!pp.classList.contains('abierto')) pp.innerHTML = ''; }, 480); }
      if (abierto.btn) { abierto.btn.setAttribute('aria-expanded', 'false'); abierto.btn.textContent = 'Ver detalle ▾'; }
      abierto = null;
    }
    function abrirDetalle(btn) {
      const key = btn.dataset.det, panelId = btn.dataset.panel, det = DET[key]; if (!det) return;
      if (abierto && abierto.btn === btn) { cerrarDetalle(); return; }
      cerrarDetalle();
      const p = root.querySelector('#' + panelId);
      p.innerHTML = '<div class="card"><div class="det-cab"><h2>' + esc(det.titulo) + ' · ' + esc(det.valor) + '</h2><button type="button" class="btn" data-xl>Descargar Excel</button></div>' +
        '<div class="det-como">' + esc(det.como) + '</div><div data-tablas></div></div>';
      const cont = p.querySelector('[data-tablas]'), insts = det.tablas.map(t => { const c = document.createElement('div'); cont.appendChild(c); return DL.tabla(c, Object.assign({}, t.def, { filas: t.filas }), { titulo: det.tablas.length > 1 }); });
      p.querySelector('[data-xl]').addEventListener('click', () => {
        DL.descargarExcel(DL.slug(det.titulo) + '_' + DL.hoyISO() + '.xlsx', insts.map(i => ({ def: i.def, filas: i.filtradas() })), infoHoja(det));
      });
      requestAnimationFrame(() => p.classList.add('abierto'));
      btn.setAttribute('aria-expanded', 'true'); btn.textContent = 'Ocultar detalle ▴';
      abierto = { btn, panel: panelId };
    }
    root.addEventListener('click', e => {
      const b = e.target.closest('[data-det]'); if (b) { abrirDetalle(b); return; }
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'salir' && opt.logout) opt.logout();
      if (a.dataset.a === 'todo') {
        const tablas = [], usados = new Set();
        ORDEN_TODO.forEach(key => DET[key].tablas.forEach(t => { const nom = t.def.nombre; if (usados.has(nom)) return; usados.add(nom); tablas.push({ def: t.def, filas: t.filas }); }));
        const wb = XLSX.utils.book_new(), nombres = new Set();
        tablas.forEach(t => { let n = String(t.def.hoja || t.def.nombre).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31), x = n, i = 2; while (nombres.has(x.toLowerCase())) x = n.slice(0, 28) + ' ' + i++; nombres.add(x.toLowerCase()); XLSX.utils.book_append_sheet(wb, DL.hoja(t.def, t.filas), x); });
        const inf = XLSX.utils.aoa_to_sheet([['Archivo de origen', d.meta.archivo], ['Fecha de los datos', DL.fechaHora(d.meta.generado)], ['Contenido', 'Una hoja por cada detalle del dashboard']]); inf['!cols'] = [{ wch: 22 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(wb, inf, 'Info');
        XLSX.writeFile(wb, 'control_logistico_' + DL.hoyISO() + '.xlsx', { cellDates: true });
      }
    });

    let ini = 0; if (!opt.preview) { const s = parseInt(DL.ls.get('dl_tab'), 10); if (s >= 0 && s < tabs.length) ini = s; }
    activar(ini);
    return { destroy() { charts.forEach(c => c.destroy()); root.innerHTML = ''; } };
  };

  g.Dashboard = Dashboard;
})(window);

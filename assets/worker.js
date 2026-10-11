/* Web Worker: lee el Excel y calcula los agregados. Nada sale del navegador. */
importScripts('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');

const avance = (pct, msg) => postMessage({ tipo: 'progreso', pct, msg });

/* ---------- helpers ---------- */
const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const str = v => v == null ? '' : String(v).trim();
const sku = v => { let s = str(v); if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, ''); return s; };
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null || v === '') return 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (/,/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return isFinite(n) ? n : 0;
}
const esNum = v => typeof v === 'number' && isFinite(v);
const pad = x => String(x).padStart(2, '0');
const isoUTC = d => d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
// fecha -> 'AAAA-MM-DD' (acepta número de serie Excel, Date o texto dd/mm/aaaa)
function iso(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (v < 36526 || v > 73050) return null; return isoUTC(new Date(Date.UTC(1899, 11, 30) + Math.floor(v + 1e-6) * 864e5)); }
  if (v instanceof Date) { if (isNaN(v)) return null; const y = v.getFullYear(); return y < 2000 || y > 2100 ? null : y + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()); }
  const s = String(v).trim();
  let m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/.exec(s);
  if (m) { const d = +m[1], mo = +m[2], y = +m[3]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) return y + '-' + pad(mo) + '-' + pad(d); return null; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && +m[1] >= 2000 && +m[1] <= 2100) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}
function minutos(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round((v % 1) * 1440);
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes() + (v.getSeconds() >= 30 ? 1 : 0);
  const m = /(\d+):(\d{2})/.exec(String(v)); return m ? +m[1] * 60 + +m[2] : null;
}
function colmap(fila) { const m = {}; (fila || []).forEach((h, i) => { const k = norm(h); if (k && !(k in m)) m[k] = i; }); return m; }
function need(sheet, m, nombres, avisos, requerido) {
  const falta = nombres.filter(n => !(norm(n) in m));
  if (falta.length) {
    const t = 'Hoja "' + sheet + '": no se encontraron las columnas ' + falta.join(', ');
    if (requerido) throw new Error(t); else avisos.push(t);
  }
}
const mediana = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const lunesDe = isoStr => { const d = new Date(isoStr + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return isoUTC(d); };
const ym = isoStr => isoStr.slice(0, 7);
const redond = (v, d) => { const f = Math.pow(10, d || 0); return Math.round(v * f) / f; };

onmessage = e => {
  try { postMessage({ tipo: 'listo', data: procesar(e.data.buffer, e.data.nombre) }); }
  catch (err) { postMessage({ tipo: 'error', msg: err && err.message ? err.message : String(err) }); }
};

function procesar(buffer, nombreArchivo) {
  const avisos = [], filasHoja = {};
  avance(3, 'Abriendo el archivo…');
  const wb0 = XLSX.read(buffer, { type: 'array', bookSheets: true });
  const reales = {}; wb0.SheetNames.forEach(n => { reales[norm(n)] = n; });
  const quiero = ['corte', 'desp', 'inv sistema', 'arribos', 'cont_hodo', 'horario_trans', 'bodega m2', 'direcciones'];
  if (!reales['corte']) throw new Error('El archivo no tiene la hoja "Corte".');
  if (!reales['desp']) throw new Error('El archivo no tiene la hoja "Desp".');
  quiero.forEach(q => { if (!reales[q]) avisos.push('No se encontró la hoja "' + q + '"; esa parte quedará vacía.'); });
  avance(8, 'Leyendo hojas (puede tardar un minuto)…');
  const wb = XLSX.read(buffer, { type: 'array', dense: true, cellDates: false, cellText: false, cellFormula: false, cellStyles: false, cellNF: false,
    sheets: quiero.filter(q => reales[q]).map(q => reales[q]) });
  avance(45, 'Archivo leído. Calculando…');
  // siempre desde A1, aunque la hoja use un rango que parte en otra columna (p. ej. "Bodega M2" parte en B)
  const filas = q => {
    const ws = reales[q] && wb.Sheets[reales[q]]; if (!ws || !ws['!ref']) return [];
    const e = XLSX.utils.decode_range(ws['!ref']).e;
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true, range: { s: { r: 0, c: 0 }, e } });
  };

  /* ---------- Direcciones ---------- */
  const zonaDe = new Map();
  { const R = filas('direcciones'); if (R.length) {
    const m = colmap(R[0]); need('Direcciones', m, ['Auxiliar NV', 'Zona Logística'], avisos, false);
    const a = m['auxiliar nv'], z = m['zona logistica'];
    if (a != null && z != null) for (let i = 1; i < R.length; i++) { const zz = str(R[i][z]); if (zz && zz !== '0') zonaDe.set(sku(R[i][a]), zz); }
    filasHoja['Direcciones'] = R.length - 1;
  } }

  /* ---------- INV sistema ---------- */
  const inventario = [], stockDe = new Map();
  { const R = filas('inv sistema'); if (R.length) {
    const m = colmap(R[0]); need('INV sistema', m, ['Cod. Producto', 'Producto', 'INV Sis', 'Costo Unit.', 'Costo Total', 'recurrencia'], avisos, false);
    for (let i = 1; i < R.length; i++) {
      const r = R[i], c = sku(r[m['cod. producto']]); if (!c) continue;
      const it = { sku: c, producto: str(r[m['producto']]), stock: num(r[m['inv sis']]), costoUnit: num(r[m['costo unit.']]), costoTotal: num(r[m['costo total']]), rec: num(r[m['recurrencia']]) };
      inventario.push(it); stockDe.set(c, (stockDe.get(c) || 0) + it.stock);
    }
    filasHoja['INV sistema'] = inventario.length;
  } }

  /* ---------- Arribos ---------- */
  const arribos = [], proxArr = new Map(); // sku -> {fecha, unidades}
  { const R = filas('arribos'); if (R.length) {
    const m = colmap(R[0]); need('Arribos', m, ['ETA PTO', 'Arribo estimado', 'ESTATUS', 'SKU', 'Descripcion Downlight', 'Unidades', 'Arribo?'], avisos, false);
    for (let i = 1; i < R.length; i++) {
      const r = R[i], s = sku(r[m['sku']]); if (!s) continue;
      const llego = norm(r[m['arribo?']]) === 'si';
      const a = { eta: iso(r[m['eta pto']]), arribo: iso(r[m['arribo estimado']]), estatus: str(r[m['estatus']]), sku: s, desc: str(r[m['descripcion downlight']]), unidades: num(r[m['unidades']]), llego };
      arribos.push(a);
      if (!llego) { const p = proxArr.get(s) || { fecha: null, camino: 0 }; p.camino += a.unidades; if (a.arribo && (!p.fecha || a.arribo < p.fecha)) p.fecha = a.arribo; proxArr.set(s, p); }
    }
    filasHoja['Arribos'] = arribos.length;
  } }

  /* ---------- Corte ---------- */
  avance(55, 'Procesando notas de venta…');
  const RC = filas('corte'); const mC = colmap(RC[0]);
  need('Corte', mC, ['Bloqueado', 'nvEstado', 'Canal_EN', 'NVNumero', 'Dias NV', 'Fec_Cre', 'CodAux', 'NomAux', 'CodProd', 'DetProd', 'nvCant', 'ES_INV', 'nvTotLinea', 'Sal_X_ Des', 'Valor SdespNV', 'VenDes', 'Status des', 'Proceso'], avisos, true);
  const cB = mC['bloqueado'], cE = mC['nvestado'], cCa = mC['canal_en'], cNV = mC['nvnumero'], cDi = mC['dias nv'], cF = mC['fec_cre'], cAux = mC['codaux'],
    cNom = mC['nomaux'], cCod = mC['codprod'], cDet = mC['detprod'], cCant = mC['nvcant'], cQ = mC['es_inv'], cTot = mC['nvtotlinea'],
    cSal = mC['sal_x_ des'], cVal = mC['valor sdespnv'], cVen = mC['vendes'], cSt = mC['status des'], cPr = mC['proceso'];
  let anio = 0, lineas = 0;
  for (let i = 1; i < RC.length; i++) { const r = RC[i]; if (!r || str(r[cB]) === 'Total') continue; const f = iso(r[cF]); if (f) { const y = +f.slice(0, 4); if (y > anio) anio = y; } }
  if (!anio) anio = new Date().getFullYear();
  const nvMap = new Map(), qLin = [], ventaMes = new Map(), ventaVen = new Map(), ventaSku = new Map(), nvEmit = new Set(), canales = new Set();
  for (let i = 1; i < RC.length; i++) {
    const r = RC[i]; if (!r) continue;
    const bl = str(r[cB]); if (bl === 'Total' || (bl === '' && r[cNV] == null)) continue;
    lineas++;
    const est = str(r[cE]).toUpperCase(), canal = str(r[cCa]).toUpperCase() || 'SIN CANAL', nv = str(r[cNV]), f = iso(r[cF]);
    canales.add(canal);
    if ((est === 'C' || est === 'A' || est === 'P') && f && +f.slice(0, 4) === anio) {
      const tot = num(r[cTot]), mes = ym(f);
      let o = ventaMes.get(mes); if (!o) ventaMes.set(mes, o = {}); o[canal] = (o[canal] || 0) + tot;
      const ven = str(r[cVen]) || 'Sin vendedor'; ventaVen.set(ven, (ventaVen.get(ven) || 0) + tot);
      const cp = sku(r[cCod]); let s = ventaSku.get(cp); if (!s) ventaSku.set(cp, s = { sku: cp, producto: str(r[cDet]), unidades: 0, ventas: 0, nvs: new Set() });
      s.unidades += num(r[cCant]); s.ventas += tot; s.nvs.add(nv); nvEmit.add(nv);
    }
    if (est !== 'A') continue;
    let o = nvMap.get(nv);
    if (!o) {
      o = { nv, fecha: null, dias: 0, cliente: str(r[cNom]), vendedor: str(r[cVen]), canal, etapa: '', estadoDesp: '', bloq: false, lineas: 0, quiebres: 0, valor: 0, zona: zonaDe.get(sku(r[cAux])) || 'Sin zona' };
      nvMap.set(nv, o);
    }
    if (f && (!o.fecha || f < o.fecha)) o.fecha = f;
    o.dias = Math.max(o.dias, num(r[cDi]));
    if (!o.etapa) o.etapa = str(r[cPr]);
    if (!o.estadoDesp) o.estadoDesp = str(r[cSt]);
    if (bl === 'S') o.bloq = true;
    o.lineas++; o.valor += num(r[cVal]);
    if (str(r[cQ]).toUpperCase() === 'QUIEBRE') {
      o.quiebres++;
      const cp = sku(r[cCod]), pend = esNum(r[cSal]) ? r[cSal] : (r[cSal] != null && r[cSal] !== '' ? num(r[cSal]) : num(r[cCant]));
      qLin.push({ nv, cliente: o.cliente, sku: cp, producto: str(r[cDet]), pend, valor: num(r[cTot]), stock: stockDe.has(cp) ? stockDe.get(cp) : null,
        arribo: proxArr.has(cp) ? proxArr.get(cp).fecha : null });
    }
  }
  RC.length = 0;
  filasHoja['Corte'] = lineas;
  const nvLista = Array.from(nvMap.values()).map(o => ({ nv: o.nv, fecha: o.fecha, dias: o.dias, cliente: o.cliente, vendedor: o.vendedor || 'Sin vendedor', canal: o.canal,
    etapa: o.etapa || 'Sin etapa', estadoDesp: o.estadoDesp || 'Sin estado', bloq: o.bloq ? 'Sí' : 'No', lineas: o.lineas, quiebres: o.quiebres, valor: redond(o.valor, 0), zona: o.zona }))
    .sort((a, b) => b.dias - a.dias);
  // quiebres por SKU
  const qs = new Map();
  qLin.forEach(l => {
    let s = qs.get(l.sku); if (!s) qs.set(l.sku, s = { sku: l.sku, producto: l.producto, nvs: new Set(), unidades: 0, valor: 0 });
    s.nvs.add(l.nv); s.unidades += l.pend; s.valor += l.valor;
  });
  const quiebreSku = Array.from(qs.values()).map(s => { const p = proxArr.get(s.sku); return { sku: s.sku, producto: s.producto, nv: s.nvs.size, unidades: s.unidades, valor: redond(s.valor, 0),
    stock: stockDe.has(s.sku) ? stockDe.get(s.sku) : null, proxArribo: p ? p.fecha : null, enCamino: p ? p.camino : 0 }; }).sort((a, b) => b.valor - a.valor);
  qLin.sort((a, b) => b.valor - a.valor);
  qLin.forEach(l => { l.valor = redond(l.valor, 0); });

  const meses = Array.from(ventaMes.keys()).sort();
  const ventas = { anio, canales: Array.from(canales).sort(), meses: meses.map(m => ({ mes: m, porCanal: ventaMes.get(m), total: Object.values(ventaMes.get(m)).reduce((a, b) => a + b, 0) })),
    vendedores: Array.from(ventaVen, ([vendedor, total]) => ({ vendedor, total })).sort((a, b) => b.total - a.total),
    top: Array.from(ventaSku.values()).sort((a, b) => b.ventas - a.ventas).slice(0, 30).map(s => ({ sku: s.sku, producto: s.producto, unidades: s.unidades, ventas: redond(s.ventas, 0), nv: s.nvs.size })),
    nvEmitidas: nvEmit.size };
  ventas.mesCerrado = meses.length >= 2 ? meses[meses.length - 2] : (meses[0] || null);

  /* ---------- Desp (cumplimiento y equipo) ---------- */
  avance(75, 'Calculando cumplimiento de despachos…');
  const RD = filas('desp'); const mD = colmap(RD[0]);
  need('Desp', mD, ['Estado', 'NV', 'Cliente', 'Chofer', 'OP_Picking', 'Auditor', 'F_Crea', 'Dias_entreg', 'Cum _inv%', 'Status', 'Proceso'], avisos, true);
  const dE = mD['estado'], dNV = mD['nv'], dCl = mD['cliente'], dCh = mD['chofer'], dPi = mD['op_picking'], dAu = mD['auditor'], dF = mD['f_crea'], dDi = mD['dias_entreg'],
    dCu = mD['cum _inv%'], dSt = mD['status'], dPr = mD['proceso'];
  const cum = new Map(), equipo = { chofer: new Map(), picking: new Map(), auditor: new Map() }, cand = []; let despFilas = 0;
  const cuenta = (mp, v) => { const t = str(v); if (!t || t === '0' || norm(t) === 'conductor') return; mp.set(t, (mp.get(t) || 0) + 1); };
  for (let i = 1; i < RD.length; i++) {
    const r = RD[i]; if (!r) continue;
    const est = str(r[dE]).toUpperCase(); if (est !== 'C' && est !== 'A' && est !== 'P') continue;
    despFilas++;
    const f = iso(r[dF]); if (!f || +f.slice(0, 4) !== anio) continue;
    const c = num(r[dCu]), at = num(r[dDi]), mes = ym(f);
    let o = cum.get(mes); if (!o) cum.set(mes, o = { mes, nv: 0, completas: 0, parciales: 0, suma: 0, atraso: 0 });
    o.nv++; o.suma += c; if (c >= 1 - 1e-9) o.completas++; else o.parciales++; if (at > 0) o.atraso++;
    cuenta(equipo.chofer, r[dCh]); cuenta(equipo.picking, r[dPi]); cuenta(equipo.auditor, r[dAu]);
    if (c < 1 - 1e-9 || at > 0) cand.push({ nv: str(r[dNV]), cliente: str(r[dCl]), fecha: f, cumInv: c, diasEntreg: at, estado: str(r[dSt]) || est, proceso: str(r[dPr]) });
  }
  RD.length = 0; filasHoja['Desp'] = despFilas;
  const cumpl = Array.from(cum.values()).sort((a, b) => a.mes < b.mes ? -1 : 1).map(o => ({ mes: o.mes, nv: o.nv, completas: o.completas, parciales: o.parciales, prom: o.nv ? o.suma / o.nv : 0, atraso: o.atraso }));
  const mesCerrado = cumpl.length >= 2 ? cumpl[cumpl.length - 2].mes : (cumpl.length ? cumpl[0].mes : null);
  const cumplDet = cand.filter(x => ym(x.fecha) === mesCerrado).sort((a, b) => a.cumInv - b.cumInv || b.diasEntreg - a.diasEntreg);
  const aLista = mp => Array.from(mp, ([n, nv]) => ({ n, nv })).sort((a, b) => b.nv - a.nv);

  /* ---------- Flota ---------- */
  avance(85, 'Calculando flota y bodega…');
  const diario = []; const combus = new Map(), mant = new Map();
  { const R = filas('cont_hodo'); if (R.length) {
    for (let i = 2; i < R.length; i++) {
      const r = R[i]; if (!r) continue;
      const pat = str(r[3]); if (pat && pat !== '0') {
        const f = iso(r[0]);
        if (f) diario.push({ fecha: f, patente: pat, tipo: str(r[2]), operador: str(r[4]), uso: num(r[7]), nv: num(r[8]) });
      }
      const pc = str(r[19]); if (pc && pc !== '0' && esNum(r[21])) combus.set(pc, (combus.get(pc) || 0) + r[21]);
      const pm = str(r[26]); if (pm && pm !== '0' && esNum(r[27])) mant.set(pm, (mant.get(pm) || 0) + r[27]);
    }
    filasHoja['Cont_Hodo'] = diario.length;
  } }
  const viajes = new Map();
  { const R = filas('horario_trans'); if (R.length) {
    let n = 0;
    for (let i = 2; i < R.length; i++) {
      const r = R[i]; if (!r) continue; let pat = str(r[1]); if (!pat || pat === '0') continue;
      if (pat === 'VVJV-24') pat = 'VVJU-24';
      const mi = minutos(r[4]); if (mi == null) continue;
      const o = viajes.get(pat) || { n: 0, min: 0 }; o.n++; o.min += mi; viajes.set(pat, o); n++;
    }
    filasHoja['Horario_Trans'] = n;
  } }
  const vehMap = new Map();
  diario.forEach(d => {
    let v = vehMap.get(d.patente); if (!v) vehMap.set(d.patente, v = { patente: d.patente, tipo: d.tipo, operador: d.operador, fechas: new Set(), uso: 0, nv: 0 });
    v.fechas.add(d.fecha); v.uso += d.uso; v.nv += d.nv; if (d.operador) v.operador = d.operador;
  });
  new Set([...combus.keys(), ...mant.keys(), ...viajes.keys()]).forEach(p => { if (!vehMap.has(p)) vehMap.set(p, { patente: p, tipo: '', operador: '', fechas: new Set(), uso: 0, nv: 0 }); });
  const vehiculos = Array.from(vehMap.values()).map(v => {
    const comb = combus.get(v.patente) || 0, man = mant.get(v.patente) || 0, vj = viajes.get(v.patente);
    return { patente: v.patente, tipo: v.tipo, operador: v.operador, dias: v.fechas.size, uso: redond(v.uso, 1), nv: v.nv, combustible: comb, mantencion: man,
      costoNV: v.nv > 0 ? redond((comb + man) / v.nv, 0) : null, viajes: vj ? vj.n : 0, minProm: vj ? redond(vj.min / vj.n, 0) : null };
  }).sort((a, b) => b.nv - a.nv);
  diario.sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0);

  /* ---------- Bodega ---------- */
  const pasillos = new Map();
  { const R = filas('bodega m2'); if (R.length) {
    for (let i = 1; i < R.length; i++) {
      const r = R[i]; if (!r) continue; const p = str(r[1]); if (!p || norm(p) === 'total') continue;
      if (!esNum(r[6])) continue;
      const o = pasillos.get(p) || { pasillo: p, m2: 0, utilizado: 0, utilizable: 0 };
      o.m2 += num(r[6]); o.utilizado += num(r[7]); o.utilizable += num(r[8]); pasillos.set(p, o);
    }
    filasHoja['Bodega M2'] = pasillos.size;
  } }
  const bodegaP = Array.from(pasillos.values()).map(o => ({ pasillo: o.pasillo, m2: redond(o.m2, 2), utilizado: redond(o.utilizado, 2), utilizable: redond(o.utilizable, 2), ocupacion: o.m2 ? o.utilizado / o.m2 : 0 }));
  const bm2 = bodegaP.reduce((a, o) => a + o.m2, 0), bu = bodegaP.reduce((a, o) => a + o.utilizado, 0);

  const sinZona = nvLista.filter(n => n.zona === 'Sin zona').length;
  if (nvLista.length && sinZona > nvLista.length * 0.2) avisos.push(sinZona + ' de ' + nvLista.length + ' NV abiertas no tienen zona logística en la hoja "Direcciones".');
  if (!nvLista.length) avisos.push('No hay NV abiertas (nvEstado = A): revisa que el Excel esté actualizado.');
  const sinStock = quiebreSku.filter(q => q.stock == null).length;
  if (sinStock) avisos.push(sinStock + ' SKU en quiebre no están en "INV sistema" (se muestran sin stock).');
  avance(95, 'Armando resultado…');

  const ahora = new Date();
  return {
    meta: { version: 1, generado: ahora.toISOString(), hoy: pad(ahora.getFullYear()) + '-' + pad(ahora.getMonth() + 1) + '-' + pad(ahora.getDate()),
      archivo: nombreArchivo, anio, ultimoMesCerrado: mesCerrado, filasHoja, avisos },
    nv: nvLista, quiebreLineas: qLin, quiebreSku, ventas,
    cumplimiento: { meses: cumpl, mesCerrado, detalle: cumplDet },
    equipo: { chofer: aLista(equipo.chofer), picking: aLista(equipo.picking), auditor: aLista(equipo.auditor) },
    inventario, arribos,
    flota: { vehiculos, diario },
    bodega: { m2: redond(bm2, 2), utilizado: redond(bu, 2), ocupacion: bm2 ? bu / bm2 : 0, pasillos: bodegaP }
  };
}

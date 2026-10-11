/* Utilidades comunes: formatos chilenos, cifrado, lectura del .enc, tablas y exportación a Excel */
(function (g) {
  'use strict';
  const DL = {};
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  DL.MESES = MESES; DL.MESES_L = MESES_L;

  /* ---------- Formatos (miles con punto, decimales con coma) ---------- */
  function agrupar(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  DL.n = function (v, dec) {
    if (v == null || v === '' || isNaN(v)) return '–';
    dec = dec || 0;
    const neg = v < 0; const a = Math.abs(v).toFixed(dec).split('.');
    return (neg ? '-' : '') + agrupar(a[0]) + (a[1] ? ',' + a[1] : '');
  };
  DL.pct = function (v, dec) { return v == null || isNaN(v) ? '–' : DL.n(v * 100, dec == null ? 1 : dec) + '%'; };
  DL.clp = function (v) { return v == null || isNaN(v) ? '–' : (v < 0 ? '-$' : '$') + DL.n(Math.abs(Math.round(v))); };
  DL.mm = function (v) {
    if (v == null || isNaN(v)) return '–';
    return Math.abs(v) >= 1e6 ? (v < 0 ? '-$' : '$') + DL.n(Math.abs(v) / 1e6, 0) + ' M' : DL.clp(v);
  };
  DL.pp = function (v) { return (v >= 0 ? '+' : '−') + DL.n(Math.abs(v) * 100, 1) + ' pp'; };
  // fechas internas: 'AAAA-MM-DD'
  DL.fecha = function (iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return String(iso);
    return +m[3] + ' ' + MESES[+m[2] - 1] + ' ' + m[1];
  };
  DL.fechaHora = function (iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const p = x => String(x).padStart(2, '0');
    return d.getDate() + ' ' + MESES_L[d.getMonth()] + ' ' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  DL.mesNombre = function (ym) { const [y, m] = ym.split('-'); return MESES[+m - 1] + ' ' + y; };
  DL.mesLargo = function (ym) { const [y, m] = ym.split('-'); return MESES_L[+m - 1] + ' ' + y; };
  DL.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); };
  DL.hoyISO = function (d) { d = d || new Date(); const p = x => String(x).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };

  /* ---------- Cifrado: JSON -> gzip -> AES-GCM 256 (PBKDF2-SHA256, 600.000 it.) ---------- */
  const MAGIC = [0x44, 0x4C, 0x56, 0x31]; // "DLV1"
  const ITER = 600000;
  const enc = new TextEncoder(), dec = new TextDecoder();

  async function streamBytes(stream) { return new Uint8Array(await new Response(stream).arrayBuffer()); }
  async function gzip(bytes) {
    if (typeof CompressionStream !== 'undefined') return streamBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
    return g.pako.gzip(bytes);
  }
  async function gunzip(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      try { return await streamBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))); } catch (e) { /* respaldo */ }
    }
    return g.pako.ungzip(bytes);
  }
  async function llave(clave, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  DL.tamanoCifrado = async function (obj) { return (await gzip(enc.encode(JSON.stringify(obj)))).length + 48 + 16; };
  DL.cifrar = async function (obj, clave) {
    const comp = await gzip(enc.encode(JSON.stringify(obj)));
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await llave(clave, salt), comp));
    const out = new Uint8Array(4 + 16 + 12 + ct.length);
    out.set(MAGIC, 0); out.set(salt, 4); out.set(iv, 20); out.set(ct, 32);
    return out;
  };
  DL.descifrar = async function (bytes, clave) {
    bytes = new Uint8Array(bytes);
    if (bytes.length < 48 || MAGIC.some((b, i) => bytes[i] !== b)) throw new Error('formato');
    const key = await llave(clave, bytes.slice(4, 20));
    let plano;
    try { plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(20, 32) }, key, bytes.slice(32))); }
    catch (e) { throw new Error('clave'); }
    return JSON.parse(dec.decode(await gunzip(plano)));
  };
  DL.leerEnc = async function (url) {
    const r = await fetch((url || 'data/data.json.gz.enc') + '?v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('No se pudo leer el archivo de datos (' + r.status + ')');
    return new Uint8Array(await r.arrayBuffer());
  };
  DL.sha256Hex = async function (txt) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(txt)));
    return Array.from(h, b => b.toString(16).padStart(2, '0')).join('');
  };
  DL.b64 = function (bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  DL.deB64 = function (b64) { const s = atob(b64.replace(/\s/g, '')); const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; };

  /* ---------- Almacenamiento seguro (puede fallar en navegación privada) ---------- */
  DL.ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* nada */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  };

  /* ---------- Tablas con búsqueda, orden, contador, totales y descarga ----------
     tabla = { nombre, cols:[{k,t,tipo:'txt'|'num'|'clp'|'pct'|'fecha'|'dec', fmt?}], filas:[{...}], totales:{k:'sum'|'texto'}, orden:{k,dir} } */
  function valorCelda(c, f) { const v = f[c.k]; return v; }
  function textoCelda(c, f) {
    const v = f[c.k]; if (c.fmt) return c.fmt(v, f);
    if (v == null || v === '') return c.vacio || '';
    switch (c.tipo) {
      case 'clp': return DL.clp(v);
      case 'num': return DL.n(v);
      case 'dec': return DL.n(v, 1);
      case 'pct': return DL.pct(v);
      case 'fecha': return DL.fecha(v);
      default: return String(v);
    }
  }
  DL.tabla = function (cont, def, opt) {
    opt = opt || {};
    const st = { q: '', ord: def.orden ? { k: def.orden.k, dir: def.orden.dir } : null };
    const uid = 't' + Math.random().toString(36).slice(2, 8);
    cont.innerHTML = (def.nombre && opt.titulo !== false ? '<div class="tbl-sub">' + DL.esc(def.nombre) + '</div>' : '') +
      '<div class="tbl-tools"><label class="sr" for="' + uid + '">Buscar</label><input type="search" id="' + uid + '" placeholder="Buscar…" autocomplete="off">' +
      '<span class="tbl-count" aria-live="polite"></span></div><div class="tbl-wrap"><table><thead></thead><tbody></tbody><tfoot></tfoot></table></div>';
    const q = cont.querySelector('input'), cnt = cont.querySelector('.tbl-count'), thead = cont.querySelector('thead'),
      tbody = cont.querySelector('tbody'), tfoot = cont.querySelector('tfoot');
    const cls = c => (c.tipo && c.tipo !== 'txt' && c.tipo !== 'fecha' ? 'num' : '');
    const num = c => ['num', 'clp', 'dec', 'pct'].includes(c.tipo);
    function filtradas() {
      let r = def.filas;
      const t = st.q.trim().toLowerCase();
      if (t) r = r.filter(f => def.cols.some(c => textoCelda(c, f).toLowerCase().includes(t)));
      if (st.ord) {
        const c = def.cols.find(x => x.k === st.ord.k), d = st.ord.dir === 'asc' ? 1 : -1;
        r = r.slice().sort((a, b) => {
          let x = a[st.ord.k], y = b[st.ord.k];
          if (x == null || x === '') return 1; if (y == null || y === '') return -1;
          if (num(c)) return (x - y) * d;
          return String(x).localeCompare(String(y), 'es', { numeric: true }) * d;
        });
      }
      return r;
    }
    function pintar() {
      const r = filtradas(); cont._filtradas = r;
      thead.innerHTML = '<tr>' + def.cols.map(c => '<th class="' + cls(c) + '" data-k="' + c.k + '" tabindex="0" ' +
        (st.ord && st.ord.k === c.k ? 'aria-sort="' + (st.ord.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' + DL.esc(c.t) + '</th>').join('') + '</tr>';
      const MAX = 1500;
      tbody.innerHTML = r.slice(0, MAX).map(f => '<tr>' + def.cols.map(c => {
        const tx = DL.esc(textoCelda(c, f));
        const extra = c.cls ? c.cls(f[c.k], f) : '';
        return '<td class="' + cls(c) + (extra ? ' ' + extra : '') + '">' + tx + '</td>';
      }).join('') + '</tr>').join('') || '<tr><td class="vacio" colspan="' + def.cols.length + '">Sin resultados</td></tr>';
      cnt.textContent = DL.n(r.length) + ' filas' + (r.length > MAX ? ' (se muestran ' + MAX + '; el Excel trae todas)' : '');
      if (def.totales) {
        tfoot.innerHTML = '<tr>' + def.cols.map((c, i) => {
          const t = def.totales[c.k];
          let tx = '';
          if (t === 'sum') { const s = r.reduce((a, f) => a + (+f[c.k] || 0), 0); tx = c.fmt ? c.fmt(s, null) : (c.tipo === 'clp' ? DL.clp(s) : DL.n(s)); }
          else if (typeof t === 'string') tx = t;
          else if (i === 0) tx = 'Total';
          return '<td class="' + cls(c) + '">' + DL.esc(tx) + '</td>';
        }).join('') + '</tr>';
      } else tfoot.innerHTML = '';
    }
    q.addEventListener('input', () => { st.q = q.value; pintar(); });
    function ordenar(th) {
      if (!th) return; const k = th.dataset.k;
      st.ord = st.ord && st.ord.k === k ? { k, dir: st.ord.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'asc' };
      pintar();
    }
    thead.addEventListener('click', e => ordenar(e.target.closest('th')));
    thead.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordenar(e.target.closest('th')); } });
    pintar();
    return { filtradas: () => cont._filtradas, def };
  };

  /* ---------- Exportación a Excel (SheetJS) ---------- */
  function celdaExcel(c, f) {
    const v = f[c.k];
    if (v == null || v === '') return c.vacio ? { t: 's', v: c.vacio } : null;
    if (c.tipo === 'fecha') { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); return m ? { t: 'd', v: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), z: 'dd/mm/yyyy' } : { t: 's', v: String(v) }; }
    if (c.tipo === 'clp') return { t: 'n', v: +v, z: '"$" #,##0' };
    if (c.tipo === 'pct') return { t: 'n', v: +v, z: '0.0%' };
    if (c.tipo === 'dec') return { t: 'n', v: +v, z: '#,##0.0' };
    if (c.tipo === 'num') return { t: 'n', v: +v, z: '#,##0' };
    return { t: 's', v: String(v) };
  }
  DL.hoja = function (def, filas) {
    const aoa = [def.cols.map(c => c.t)];
    const ws = {}; const R = filas.length;
    def.cols.forEach((c, j) => {
      ws[XLSX.utils.encode_cell({ r: 0, c: j })] = { t: 's', v: c.t, s: { font: { bold: true } } };
      filas.forEach((f, i) => { const cel = celdaExcel(c, f); if (cel) ws[XLSX.utils.encode_cell({ r: i + 1, c: j })] = cel; });
    });
    ws['!ref'] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: Math.max(R, 0), c: def.cols.length - 1 });
    ws['!cols'] = def.cols.map(c => {
      let w = c.t.length;
      filas.slice(0, 300).forEach(f => { const l = textoCelda(c, f).length; if (l > w) w = l; });
      return { wch: Math.min(Math.max(w + 2, 8), 60) };
    });
    ws['!autofilter'] = { ref: ws['!ref'] };
    return ws;
  };
  function nombreHoja(n, usados) {
    let b = String(n).replace(/[\\\/\?\*\[\]:]/g, ' ').trim().slice(0, 31) || 'Hoja', x = b, i = 2;
    while (usados.has(x.toLowerCase())) x = b.slice(0, 28) + ' ' + i++;
    usados.add(x.toLowerCase()); return x;
  }
  // tablas: [{def, filas}]  info: [[campo, valor], ...]
  DL.descargarExcel = function (archivo, tablas, info) {
    const wb = XLSX.utils.book_new(), usados = new Set();
    tablas.forEach((t, i) => XLSX.utils.book_append_sheet(wb, DL.hoja(t.def, t.filas), nombreHoja(i === 0 ? 'Detalle' : (t.def.hoja || t.def.nombre || 'Detalle ' + (i + 1)), usados)));
    if (info) {
      const wsI = XLSX.utils.aoa_to_sheet(info); wsI['!cols'] = [{ wch: 26 }, { wch: 90 }];
      XLSX.utils.book_append_sheet(wb, wsI, nombreHoja('Info', usados));
    }
    XLSX.writeFile(wb, archivo, { cellDates: true });
  };
  DL.slug = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); };

  g.DL = DL;
})(window);

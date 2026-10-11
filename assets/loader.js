/* Panel de carga del administrador */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const HASH_CARGA = '40083d307f2977e7bf74ec2869ea6030f6173f7c794b9e49f80e3a1bf432540d';
  const RUTA = 'data/data.json.gz.enc', HIST = 'data/historial';
  let datos = null, prev = null, bloqueoHasta = 0, intentos = 0;

  /* ---------- puerta ---------- */
  $('f-puerta').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('err-puerta'), ahora = Date.now();
    if (ahora < bloqueoHasta) { err.textContent = 'Demasiados intentos. Espera ' + Math.ceil((bloqueoHasta - ahora) / 1000) + ' s.'; return; }
    const h = await DL.sha256Hex($('clave-carga').value); $('clave-carga').value = '';
    if (h === HASH_CARGA) { intentos = 0; $('puerta').classList.add('oculto'); $('panel').classList.remove('oculto'); cargarConfig(); return; }
    intentos++;
    if (intentos >= 5) { bloqueoHasta = Date.now() + 60000; intentos = 0; err.textContent = 'Demasiados intentos. Bloqueado por 60 segundos.'; }
    else err.textContent = 'Clave incorrecta (' + (5 - intentos) + ' intentos restantes).';
  });

  /* ---------- conexión GitHub ---------- */
  function cfg() { return { token: $('gh-token').value.trim(), owner: $('gh-owner').value.trim(), repo: $('gh-repo').value.trim(), rama: $('gh-rama').value.trim() || 'main' }; }
  function cargarConfig() {
    try { const c = JSON.parse(DL.ls.get('dl_gh') || '{}'); $('gh-token').value = c.token || ''; $('gh-owner').value = c.owner || ''; $('gh-repo').value = c.repo || ''; $('gh-rama').value = c.rama || 'main'; } catch (e) { /* nada */ }
  }
  function guardarConfig() { DL.ls.set('dl_gh', JSON.stringify(cfg())); }
  $('b-guardar').addEventListener('click', () => { guardarConfig(); msg('estado-conn', 'Conexión guardada en este navegador.', true); });
  $('b-olvidar').addEventListener('click', () => { DL.ls.del('dl_gh'); $('gh-token').value = ''; $('gh-owner').value = ''; $('gh-repo').value = ''; $('gh-rama').value = 'main'; msg('estado-conn', 'Token olvidado.', true); });
  function msg(id, t, ok) { const e = $(id); e.textContent = t; e.className = 'estado ' + (ok === true ? 'ok' : ok === false ? 'mal' : ''); }

  async function gh(ruta, op) {
    const c = cfg(); if (!c.token || !c.owner || !c.repo) throw new Error('Falta completar el token, el owner o el repositorio.');
    op = op || {};
    const r = await fetch('https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo) + ruta, Object.assign({}, op, {
      headers: Object.assign({ Authorization: 'Bearer ' + c.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, op.headers || {}) }));
    return r;
  }
  async function errGH(r) { let t = ''; try { t = (await r.json()).message || ''; } catch (e) { /* nada */ } return new Error('GitHub respondió ' + r.status + (t ? ': ' + t : '') + (r.status === 401 || r.status === 403 ? ' (revisa el token y sus permisos)' : '')); }
  async function info(path) { // devuelve {sha} o null
    const r = await gh('/contents/' + path + '?ref=' + encodeURIComponent(cfg().rama));
    if (r.status === 404) return null; if (!r.ok) throw await errGH(r); return r.json();
  }
  async function crudo(path) {
    const r = await gh('/contents/' + path + '?ref=' + encodeURIComponent(cfg().rama), { headers: { Accept: 'application/vnd.github.raw+json' } });
    if (!r.ok) throw await errGH(r); return new Uint8Array(await r.arrayBuffer());
  }
  async function poner(path, bytes, sha, mensaje) {
    const body = { message: mensaje, content: DL.b64(bytes), branch: cfg().rama }; if (sha) body.sha = sha;
    const r = await gh('/contents/' + path, { method: 'PUT', body: JSON.stringify(body) });
    if (!r.ok) throw await errGH(r); return r.json();
  }
  // publica los bytes ya cifrados: primero respalda la versión vigente en data/historial
  async function publicar(bytes, estadoId, etiqueta) {
    msg(estadoId, 'Consultando la versión vigente…');
    const vigente = await info(RUTA);
    if (vigente) {
      const n = new Date(), p = x => String(x).padStart(2, '0');
      let nombre = HIST + '/' + n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()) + '_' + p(n.getHours()) + p(n.getMinutes()) + '.json.gz.enc';
      if (await info(nombre)) nombre = nombre.replace('.json.gz.enc', p(n.getSeconds()) + '.json.gz.enc');
      msg(estadoId, 'Guardando copia de la versión anterior…');
      await poner(nombre, await crudo(RUTA), null, 'Respaldo de datos antes de ' + etiqueta);
    }
    msg(estadoId, 'Publicando…');
    await poner(RUTA, bytes, vigente && vigente.sha, etiqueta + ' (' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ')');
  }

  /* ---------- procesar el Excel ---------- */
  $('archivo').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    datos = null; $('s-valid').classList.add('oculto'); $('s-prev').classList.add('oculto'); $('s-pub').classList.add('oculto'); $('b-publicar').disabled = true;
    if (prev) { prev.destroy(); prev = null; }
    $('progreso').style.width = '1%'; msg('estado-proc', 'Leyendo el archivo…');
    const lector = new FileReader();
    lector.onerror = () => msg('estado-proc', 'No se pudo leer el archivo.', false);
    lector.onload = () => {
      const w = new Worker('assets/worker.js');
      w.onmessage = async ev => {
        const m = ev.data;
        if (m.tipo === 'progreso') { $('progreso').style.width = m.pct + '%'; msg('estado-proc', m.msg); }
        else if (m.tipo === 'error') { w.terminate(); $('progreso').style.width = '0'; msg('estado-proc', 'Error: ' + m.msg, false); }
        else if (m.tipo === 'listo') { w.terminate(); datos = m.data; $('progreso').style.width = '100%'; msg('estado-proc', 'Listo.', true); await mostrar(); }
      };
      w.onerror = ev => msg('estado-proc', 'Error del procesador: ' + (ev.message || 'desconocido'), false);
      w.postMessage({ buffer: lector.result, nombre: f.name }, [lector.result]);
    };
    lector.readAsArrayBuffer(f);
  });

  async function mostrar() {
    const k = Dashboard.calc(datos), d = datos, li = (a, b) => '<li><b>' + DL.esc(a) + ':</b> ' + DL.esc(b) + '</li>';
    const tam = await DL.tamanoCifrado(d);
    const filas = Object.entries(d.meta.filasHoja).map(([h, n]) => DL.esc(h) + ' ' + DL.n(n)).join(' · ');
    $('valid').innerHTML = '<p><b>Archivo:</b> ' + DL.esc(d.meta.archivo) + ' · año de análisis ' + d.meta.anio + ' · último mes cerrado ' + (d.meta.ultimoMesCerrado ? DL.mesLargo(d.meta.ultimoMesCerrado) : '–') + '</p>' +
      '<p><b>Filas leídas por hoja:</b> ' + filas + '</p><ul class="lista-val">' +
      li('NV abiertas', DL.n(k.nvN) + ' (' + DL.n(k.bloq) + ' bloqueadas)') + li('Valor por despachar', DL.mm(k.valor)) + li('NV con quiebre', DL.n(k.nvQ) + ' (' + DL.n(k.lineasQ) + ' líneas)') +
      li('% in full último mes cerrado', k.mes ? DL.pct(k.inFull) + (k.mesPrev ? ' (mes anterior ' + DL.pct(k.inFullPrev) + ')' : '') : '–') +
      li('Ventas ' + d.meta.anio, DL.mm(k.ventasAnio) + ' (Retail ' + DL.pct(k.pctRetail) + ')') + li('SKUs en quiebre', DL.n(k.skuQ) + ' (' + DL.n(k.skuQArribo) + ' con arribo)') +
      li('Inventario', DL.mm(k.invValor) + ' en ' + DL.n(k.invSkus) + ' SKUs') + li('Unidades en tránsito', DL.n(k.transito) + ' (' + DL.n(k.venc) + ' vencidas)') + li('Ocupación de bodega', DL.pct(k.ocup)) +
      '</ul>' + (d.meta.avisos.length ? '<p class="adv" style="margin-bottom:0">Advertencias:</p><ul class="lista-val adv">' + d.meta.avisos.map(a => '<li>' + DL.esc(a) + '</li>').join('') + '</ul>' : '<p>Sin advertencias.</p>') +
      '<p><b>Tamaño final del archivo cifrado:</b> ' + DL.n(tam / 1024, 0) + ' KB</p>';
    $('s-valid').classList.remove('oculto'); $('s-prev').classList.remove('oculto'); $('s-pub').classList.remove('oculto');
    prev = Dashboard.mount($('preview'), d, { preview: true });
    actualizarBoton();
  }

  /* ---------- clave de lectura y botón publicar ---------- */
  function actualizarBoton() {
    const a = $('lectura1').value, b = $('lectura2').value, av = $('av-clave');
    av.className = 'aviso';
    if (a && a.length < 2) av.textContent = 'La clave debe tener al menos 2 caracteres.';
    else if (a && a.length < 12) { av.textContent = 'Clave débil: con menos de 12 caracteres es fácil de adivinar. Puedes continuar.'; av.classList.add('debil'); }
    else if (b && a !== b) av.textContent = 'Las claves no coinciden.'; else av.textContent = '';
    if (a.length >= 2 && b && a !== b) av.textContent = 'Las claves no coinciden.';
    $('b-publicar').disabled = !(datos && $('reviso').checked && a.length >= 2 && a === b);
  }
  ['reviso', 'lectura1', 'lectura2'].forEach(id => $(id).addEventListener('input', actualizarBoton));

  $('b-publicar').addEventListener('click', async () => {
    const btn = $('b-publicar'); btn.disabled = true;
    try {
      guardarConfig();
      msg('estado-pub', 'Cifrando (unos segundos)…');
      const bytes = await DL.cifrar(datos, $('lectura1').value);
      await publicar(bytes, 'estado-pub', 'Actualización de datos');
      msg('estado-pub', 'Publicado. GitHub Pages puede tardar uno o dos minutos en mostrar la versión nueva.', true);
      $('lectura1').value = ''; $('lectura2').value = ''; $('reviso').checked = false;
    } catch (e) { msg('estado-pub', 'No se pudo publicar: ' + e.message, false); }
    actualizarBoton();
  });

  /* ---------- restaurar ---------- */
  $('b-hist').addEventListener('click', async () => {
    const cont = $('lista-hist'); cont.innerHTML = ''; msg('estado-rest', 'Buscando versiones…');
    try {
      const r = await gh('/contents/' + HIST + '?ref=' + encodeURIComponent(cfg().rama));
      if (!r.ok && r.status !== 404) throw await errGH(r);
      let lista = r.status === 404 ? [] : await r.json();
      lista = (Array.isArray(lista) ? lista : []).filter(x => /\.enc$/.test(x.name)).sort((a, b) => a.name < b.name ? 1 : -1);
      msg('estado-rest', lista.length ? lista.length + ' versiones guardadas.' : 'Todavía no hay versiones anteriores.', !!lista.length);
      cont.innerHTML = lista.map(x => '<div class="hist-item"><span>' + DL.esc(x.name.replace('.json.gz.enc', '').replace('_', ' ')) + ' · ' + DL.n(x.size / 1024, 0) + ' KB</span><button type="button" class="btn peque" data-n="' + DL.esc(x.name) + '">Restaurar esta</button></div>').join('');
    } catch (e) { msg('estado-rest', 'No se pudo listar: ' + e.message, false); }
  });
  $('lista-hist').addEventListener('click', async e => {
    const b = e.target.closest('[data-n]'); if (!b) return;
    if (!confirm('¿Publicar la versión ' + b.dataset.n.replace('.json.gz.enc', '') + ' como versión vigente? La actual se guardará en el historial.')) return;
    b.disabled = true;
    try { await publicar(await crudo(HIST + '/' + b.dataset.n), 'estado-rest', 'Restauración de ' + b.dataset.n); msg('estado-rest', 'Versión restaurada. GitHub Pages puede tardar uno o dos minutos.', true); }
    catch (er) { msg('estado-rest', 'No se pudo restaurar: ' + er.message, false); }
    b.disabled = false;
  });
})();

# Downlight · Control logístico

Dashboard estático (HTML + CSS + JavaScript, sin servidor ni build) para publicar en GitHub Pages.
La gerencia lo ve con una **clave de lectura**; solo el administrador carga y publica los datos desde su computador a partir del Excel (.xlsm).

```
index.html            vista de gerencia (solo lectura, pide clave de lectura)
cargador.html         panel de carga del administrador (no está enlazado desde index.html)
assets/               styles.css, common.js, app.js, loader.js, worker.js
data/data.json.gz.enc datos publicados, cifrados (el de ejemplo se abre con la clave "demo")
data/historial/       copias cifradas de versiones anteriores
```

## Las dos claves

| Clave | Quién | Para qué |
|---|---|---|
| **Carga** | solo el administrador | Abre `cargador.html`. El código solo guarda su huella SHA-256, no la clave. Tras 5 intentos fallidos bloquea 60 segundos. |
| **Lectura** | gerencia | Es la llave con que se cifran los datos (AES-GCM 256, llave derivada con PBKDF2-SHA256, 600.000 iteraciones). **La eliges tú cada vez que publicas** y nunca queda escrita en el código, el repositorio, la consola ni la URL. |

Importante:
- La protección real de la publicación es el **token de GitHub**: sin permiso de escritura en el repositorio nadie puede cambiar los datos. La clave de carga solo evita usar el panel por descuido.
- Los datos publicados están cifrados, así que quien baje el archivo `.enc` no lee nada sin la clave de lectura. Pero una clave corta (como `01`) se puede adivinar probando combinaciones sin conexión. El panel avisa "clave débil" si tiene menos de 12 caracteres; úsala solo si aceptas ese riesgo.
- El archivo de ejemplo viene cifrado con la clave **`demo`** y **solo sirve para pruebas**: contiene datos inventados.

## Activar GitHub Pages

1. Crea un repositorio en GitHub y sube **el contenido de esta carpeta** a la raíz (con `data/historial/.gitkeep`).
2. En el repositorio: **Settings → Pages → Build and deployment → Deploy from a branch**, rama `main`, carpeta `/ (root)`.
3. Espera uno o dos minutos. La vista de gerencia queda en `https://<usuario>.github.io/<repositorio>/` y el panel en `.../cargador.html`.

## Crear el token (fine-grained)

1. GitHub → tu foto → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → elige este repositorio.
3. **Permissions → Repository permissions → Contents: Read and write.** Nada más.
4. Define una fecha de vencimiento, genera el token y cópialo (empieza con `github_pat_`).

El token se escribe solo en `cargador.html` y queda en el almacenamiento de ese navegador. El botón **Olvidar token** lo borra.

## Cargar y publicar

1. Abre `cargador.html` y escribe la clave de carga.
2. En **Conexión con GitHub** completa token, owner (usuario u organización), repositorio y rama; **Guardar conexión**.
3. Elige el Excel (`.xlsm` o `.xlsx`). Se procesa en tu navegador (puede tardar cerca de un minuto con ~30 MB); no se sube a ningún servidor.
4. Revisa la **validación** (filas por hoja, totales clave, advertencias, tamaño final) y la **vista previa** completa del dashboard con los datos nuevos.
5. Marca **Revisé los datos**, escribe la clave de lectura dos veces y pulsa **Publicar en GitHub**.
   Antes de reemplazar, el archivo vigente se copia a `data/historial/AAAA-MM-DD_HHMM.json.gz.enc`.
6. GitHub Pages tarda uno o dos minutos en mostrar la versión nueva. Comunica la clave de lectura a la gerencia por un canal aparte.

## Restaurar una versión anterior

En `cargador.html`, sección **Restaurar versión anterior**: **Restaurar versión anterior** lista el historial; elige una y confirma. Se vuelve a publicar tal cual (**conserva su cifrado original**, así que se abre con la clave de lectura que tenía en ese momento). La versión que estaba vigente también queda guardada en el historial.

## Probar en local

```
python -m http.server
```

y abre `http://localhost:8000/` (vista de gerencia, clave `demo`) o `http://localhost:8000/cargador.html`. El panel de carga no funciona abriendo el archivo con doble clic (`file://`), porque usa un Web Worker.

## Notas de cálculo

- Se lee solo lo necesario de cada hoja (encabezados normalizados con `trim`); las fechas se leen como número de serie de Excel o texto `dd/mm/aaaa`.
- "Año en curso" = año de la fecha de creación más reciente en `Corte`. "Último mes cerrado" = penúltimo mes con datos de despacho (el último está en curso).
- % in full = NV con Cum _inv% ≥ 100% / NV del mes (hoja `Desp`, estados C/A/P).
- El stock de `INV sistema` es una foto al corte: se usa para mostrar el stock actual de un SKU en quiebre, no para explicar entregas pasadas.
- Las descargas a Excel llevan formato numérico (`$ #.##0`, fechas reales, anchos ajustados). La versión gratuita de SheetJS no aplica negrita en los encabezados.
- Librerías por CDN con versión fija: SheetJS 0.18.5, Chart.js 4.4.1, pako 2.1.0.

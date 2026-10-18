import { Router } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Carpeta de archivos subidos: configurable por entorno (qa y prod no deben compartirla).
export const uploadsDir = process.env.UPLOADS_DIR ?? path.resolve(__dirname, '../../uploads')
fs.mkdirSync(uploadsDir, { recursive: true })

const MAX_BYTES = 5 * 1024 * 1024
const MAX_FILAS = 10_000
const MAX_ERRORES_EN_RESPUESTA = 100
const EXTENSIONES = ['.xlsx', '.csv']
const COLUMNAS = ['codigo', 'nombre', 'categoria', 'precio', 'stock'] as const

class ErrorDeUsuario extends Error {
  constructor(
    mensaje: string,
    public status = 400,
  ) {
    super(mensaje)
  }
}

// El nombre en disco lo decidimos nosotros: nunca se usa el nombre que manda el cliente.
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!EXTENSIONES.includes(ext)) {
      return cb(new ErrorDeUsuario('Solo se aceptan archivos .xlsx o .csv'))
    }
    cb(null, true)
  },
})

// Un .xlsx es un ZIP: empieza con los bytes "PK\x03\x04". La extensión sola no prueba nada.
function verificarContenido(ruta: string, ext: string) {
  const inicio = Buffer.alloc(4)
  const fd = fs.openSync(ruta, 'r')
  try {
    fs.readSync(fd, inicio, 0, 4, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (ext === '.xlsx') {
    if (!(inicio[0] === 0x50 && inicio[1] === 0x4b && inicio[2] === 0x03 && inicio[3] === 0x04)) {
      throw new ErrorDeUsuario('El archivo no es un .xlsx válido')
    }
  } else if (inicio.includes(0)) {
    throw new ErrorDeUsuario('El archivo no es un .csv de texto válido')
  }
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

// exceljs devuelve objetos para fórmulas, texto enriquecido e hipervínculos.
function valorCelda(valor: ExcelJS.CellValue): string | number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string') return valor.trim()
  if (typeof valor === 'number') return valor
  if (valor instanceof Date) return null
  if (typeof valor === 'object') {
    if ('result' in valor) return valorCelda(valor.result as ExcelJS.CellValue)
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('').trim()
    if ('text' in valor) return String(valor.text).trim()
  }
  return String(valor).trim()
}

function aNumero(valor: string | number | null): number {
  if (typeof valor === 'number') return valor
  if (valor === null || valor === '') return Number.NaN
  // Acepta "1.234,50" y "1234.50"
  const limpio = valor.includes(',') ? valor.replace(/\./g, '').replace(',', '.') : valor
  return Number(limpio)
}

async function leerLibro(ruta: string, ext: string): Promise<ExcelJS.Worksheet> {
  const libro = new ExcelJS.Workbook()
  if (ext === '.csv') {
    // Excel en español exporta CSV separado por ";" en vez de ",".
    const primeraLinea = fs.readFileSync(ruta, 'utf8').split(/\r?\n/, 1)[0] ?? ''
    const delimiter = primeraLinea.split(';').length > primeraLinea.split(',').length ? ';' : ','
    await libro.csv.readFile(ruta, { parserOptions: { delimiter } })
  } else {
    await libro.xlsx.readFile(ruta)
  }
  const hoja = libro.worksheets[0]
  if (!hoja) throw new ErrorDeUsuario('El archivo no contiene hojas')
  return hoja
}

type FilaValida = { codigo: string; nombre: string; categoria: string; precio: number; stock: number }

const router = Router()

router.post('/', upload.single('archivo'), async (req, res) => {
  const archivo = req.file
  if (!archivo) throw new ErrorDeUsuario('Falta el archivo (campo "archivo")')

  let aceptado = false
  try {
    const ext = path.extname(archivo.filename)
    verificarContenido(archivo.path, ext)

    const hoja = await leerLibro(archivo.path, ext)
    if (hoja.rowCount - 1 > MAX_FILAS) {
      throw new ErrorDeUsuario(`Demasiadas filas (máximo ${MAX_FILAS})`, 413)
    }

    // Mapea cabecera -> número de columna, sin importar mayúsculas ni acentos.
    const columnas = new Map<string, number>()
    hoja.getRow(1).eachCell((celda, n) => {
      const nombre = valorCelda(celda.value)
      if (typeof nombre === 'string') columnas.set(normalizar(nombre), n)
    })
    const faltantes = COLUMNAS.filter((c) => !columnas.has(c))
    if (faltantes.length) {
      throw new ErrorDeUsuario(`Faltan columnas en la primera fila: ${faltantes.join(', ')}`)
    }

    const errores: { fila: number; motivo: string }[] = []
    const validas: FilaValida[] = []
    const vistos = new Set<string>()

    for (let n = 2; n <= hoja.rowCount; n++) {
      const fila = hoja.getRow(n)
      const v = (c: (typeof COLUMNAS)[number]) => valorCelda(fila.getCell(columnas.get(c)!).value)
      const [codigo, nombre, categoria] = [v('codigo'), v('nombre'), v('categoria')]
      const [precio, stock] = [aNumero(v('precio')), aNumero(v('stock'))]

      if ([codigo, nombre, categoria, v('precio'), v('stock')].every((x) => x === null || x === '')) {
        continue // fila vacía: se ignora sin contarla como error
      }
      const motivos: string[] = []
      if (!codigo || String(codigo).length > 50) motivos.push('código vacío o de más de 50 caracteres')
      if (!nombre) motivos.push('nombre vacío')
      if (!categoria) motivos.push('categoría vacía')
      if (!Number.isFinite(precio) || precio < 0) motivos.push('precio inválido')
      if (!Number.isInteger(stock) || stock < 0) motivos.push('stock debe ser un entero mayor o igual a 0')
      if (codigo && vistos.has(String(codigo))) motivos.push(`código ${codigo} repetido en el archivo`)

      if (motivos.length) {
        errores.push({ fila: n, motivo: motivos.join('; ') })
        continue
      }
      vistos.add(String(codigo))
      validas.push({
        codigo: String(codigo),
        nombre: String(nombre),
        categoria: String(categoria),
        precio: Math.round(precio * 100) / 100,
        stock,
      })
    }

    const existe = db.prepare('SELECT 1 FROM productos WHERE codigo = ?')
    const guardar = db.prepare(
      `INSERT INTO productos (codigo, nombre, categoria, precio, stock) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(codigo) DO UPDATE SET
         nombre = excluded.nombre, categoria = excluded.categoria,
         precio = excluded.precio, stock = excluded.stock`,
    )
    let insertadas = 0
    let actualizadas = 0
    // Todo o nada: si algo falla a mitad, no queda una importación a medias.
    db.exec('BEGIN')
    try {
      for (const f of validas) {
        if (existe.get(f.codigo)) actualizadas++
        else insertadas++
        guardar.run(f.codigo, f.nombre, f.categoria, f.precio, f.stock)
      }
      db.prepare(
        `INSERT INTO archivos (nombre_original, nombre_guardado, tamano, filas_ok, filas_error)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        Buffer.from(archivo.originalname, 'latin1').toString('utf8'),
        archivo.filename,
        archivo.size,
        validas.length,
        errores.length,
      )
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    aceptado = true

    res.status(errores.length && !validas.length ? 422 : 200).json({
      filasLeidas: validas.length + errores.length,
      insertadas,
      actualizadas,
      errores: errores.slice(0, MAX_ERRORES_EN_RESPUESTA),
      erroresTotal: errores.length,
    })
  } finally {
    // Si el archivo no se aceptó, no dejamos basura en disco.
    if (!aceptado) fs.rmSync(archivo.path, { force: true })
  }
})

router.get('/plantilla', async (_req, res) => {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Productos')
  hoja.columns = COLUMNAS.map((c) => ({ header: c, key: c, width: 18 }))
  hoja.addRow({ codigo: 'PRD-9001', nombre: 'Producto de ejemplo', categoria: 'Oficina', precio: 19.9, stock: 10 })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-productos.xlsx"')
  await libro.xlsx.write(res)
  res.end()
})

export { ErrorDeUsuario }
export default router

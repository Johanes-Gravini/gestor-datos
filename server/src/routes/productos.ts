import { Router, type Request } from 'express'
import ExcelJS from 'exceljs'
import { db } from '../db.js'

const router = Router()

// Los nombres de columna no se pueden parametrizar en SQL: se validan contra una lista blanca.
const COLUMNAS_ORDEN = ['codigo', 'nombre', 'categoria', 'precio', 'stock', 'id'] as const
type ColumnaOrden = (typeof COLUMNAS_ORDEN)[number]

const MAX_LIMIT = 100
const MAX_FILAS_EXPORTACION = 50_000

function entero(valor: unknown, porDefecto: number, min: number, max: number): number {
  const n = Number.parseInt(String(valor ?? ''), 10)
  if (Number.isNaN(n)) return porDefecto
  return Math.min(Math.max(n, min), max)
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

// Filtros y orden compartidos por el listado y la exportación: lo que descargas es lo que ves.
function construirConsulta(query: Request['query']) {
  const q = texto(query.q)
  const categoria = texto(query.categoria)

  const orden = COLUMNAS_ORDEN.includes(query.orden as ColumnaOrden) ? (query.orden as ColumnaOrden) : 'id'
  const direccion = query.dir === 'desc' ? 'DESC' : 'ASC'

  const condiciones: string[] = []
  const params: (string | number)[] = []

  if (q) {
    // Con ESCAPE '!' un % o _ escrito por el usuario se busca como texto literal, no como comodín.
    const patron = `%${q.replace(/[!%_]/g, '!$&')}%`
    condiciones.push(`(nombre LIKE ? ESCAPE '!' OR codigo LIKE ? ESCAPE '!')`)
    params.push(patron, patron)
  }
  if (categoria) {
    condiciones.push('categoria = ?')
    params.push(categoria)
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''
  return { where, params, orderBy: `ORDER BY ${orden} ${direccion}, id ASC` }
}

router.get('/', (req, res) => {
  const page = entero(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER)
  const limit = entero(req.query.limit, 10, 1, MAX_LIMIT)
  const { where, params, orderBy } = construirConsulta(req.query)

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM productos ${where}`).get(...params) as {
    total: number
  }
  const data = db
    .prepare(
      `SELECT id, codigo, nombre, categoria, precio, stock, creado_en
       FROM productos ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, (page - 1) * limit)

  res.json({ data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) })
})

router.get('/categorias', (_req, res) => {
  const filas = db.prepare('SELECT DISTINCT categoria FROM productos ORDER BY categoria').all() as {
    categoria: string
  }[]
  res.json(filas.map((f) => f.categoria))
})

// Exporta TODAS las filas que cumplen el filtro (sin paginar). Se escribe en streaming:
// las filas salen hacia el cliente a medida que se leen, sin armar el archivo entero en memoria.
router.get('/exportar', async (req, res) => {
  const { where, params, orderBy } = construirConsulta(req.query)
  const filas = db
    .prepare(`SELECT codigo, nombre, categoria, precio, stock FROM productos ${where} ${orderBy} LIMIT ?`)
    .iterate(...params, MAX_FILAS_EXPORTACION) as Iterable<{
    codigo: string
    nombre: string
    categoria: string
    precio: number
    stock: number
  }>

  const fecha = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="productos-${fecha}.xlsx"`)

  const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true })
  const hoja = libro.addWorksheet('Productos', { views: [{ state: 'frozen', ySplit: 1 }] })
  hoja.columns = [
    { header: 'codigo', key: 'codigo', width: 14 },
    { header: 'nombre', key: 'nombre', width: 32 },
    { header: 'categoria', key: 'categoria', width: 18 },
    { header: 'precio', key: 'precio', width: 12, style: { numFmt: '#,##0.00' } },
    { header: 'stock', key: 'stock', width: 10, style: { numFmt: '0' } },
  ]
  hoja.getRow(1).font = { bold: true }
  hoja.getRow(1).commit()
  hoja.autoFilter = 'A1:E1'

  // Las cabeceras coinciden con las de la importación: el archivo exportado se puede volver a importar.
  for (const f of filas) hoja.addRow(f).commit()
  await hoja.commit()
  await libro.commit()
})

export default router

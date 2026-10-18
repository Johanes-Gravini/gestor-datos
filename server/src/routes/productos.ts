import { Router } from 'express'
import { db } from '../db.js'

const router = Router()

// Los nombres de columna no se pueden parametrizar en SQL: se validan contra una lista blanca.
const COLUMNAS_ORDEN = ['codigo', 'nombre', 'categoria', 'precio', 'stock', 'id'] as const
type ColumnaOrden = (typeof COLUMNAS_ORDEN)[number]

const MAX_LIMIT = 100

function entero(valor: unknown, porDefecto: number, min: number, max: number): number {
  const n = Number.parseInt(String(valor ?? ''), 10)
  if (Number.isNaN(n)) return porDefecto
  return Math.min(Math.max(n, min), max)
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

router.get('/', (req, res) => {
  const q = texto(req.query.q)
  const categoria = texto(req.query.categoria)
  const page = entero(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER)
  const limit = entero(req.query.limit, 10, 1, MAX_LIMIT)

  const orden = COLUMNAS_ORDEN.includes(req.query.orden as ColumnaOrden)
    ? (req.query.orden as ColumnaOrden)
    : 'id'
  const direccion = req.query.dir === 'desc' ? 'DESC' : 'ASC'

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

  const { total } = db.prepare(`SELECT COUNT(*) AS total FROM productos ${where}`).get(...params) as {
    total: number
  }
  const data = db
    .prepare(
      `SELECT id, codigo, nombre, categoria, precio, stock, creado_en
       FROM productos ${where}
       ORDER BY ${orden} ${direccion}, id ASC
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

export default router

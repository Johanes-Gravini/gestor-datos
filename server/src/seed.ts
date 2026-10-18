import { db, dbPath } from './db.js'

// Datos de ejemplo deterministas. INSERT OR IGNORE hace que se pueda ejecutar varias veces sin duplicar.
const categorias = ['Electrónica', 'Hogar', 'Oficina', 'Deportes', 'Juguetes']
const articulos = ['Teclado', 'Monitor', 'Lámpara', 'Silla', 'Cuaderno', 'Balón', 'Mochila', 'Auriculares', 'Mouse', 'Mesa']

const insertar = db.prepare(
  'INSERT OR IGNORE INTO productos (codigo, nombre, categoria, precio, stock) VALUES (?, ?, ?, ?, ?)',
)

db.exec('BEGIN')
for (let i = 1; i <= 60; i++) {
  const nombre = `${articulos[i % articulos.length]} modelo ${i}`
  const categoria = categorias[i % categorias.length]!
  const precio = Math.round((5 + ((i * 37) % 495) + ((i * 13) % 100) / 100) * 100) / 100
  const stock = (i * 7) % 120
  insertar.run(`PRD-${String(i).padStart(4, '0')}`, nombre, categoria, precio, stock)
}
db.exec('COMMIT')

const { total } = db.prepare('SELECT COUNT(*) AS total FROM productos').get() as { total: number }
console.log(`Seed listo en ${dbPath}: ${total} productos`)

import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// La ruta se configura por variable de entorno: cada entorno (qa, prod) usa su propia base de datos.
export const dbPath = process.env.DATABASE_PATH ?? path.resolve(__dirname, '../data/gestor.db')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

export const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS productos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo    TEXT    NOT NULL UNIQUE,
    nombre    TEXT    NOT NULL,
    categoria TEXT    NOT NULL,
    precio    REAL    NOT NULL CHECK (precio >= 0),
    stock     INTEGER NOT NULL CHECK (stock >= 0),
    creado_en TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria);
  CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos (nombre);
`)

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import productosRouter from './routes/productos.js'
import importarRouter, { ErrorDeUsuario } from './routes/importar.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../../client/dist')
const port = Number(process.env.PORT ?? 3000)

const app = express()

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    env: process.env.NODE_ENV ?? 'development',
    node: process.version,
    uptime: Math.round(process.uptime()),
  })
})

app.use('/api/productos', productosRouter)
app.use('/api/importar', importarRouter)

// En producción Express también sirve el frontend compilado (client/dist).
app.use(express.static(clientDist))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
  res.sendFile(path.join(clientDist, 'index.html'))
})

// Manejador de errores: debe ir al final. Al cliente solo le llegan mensajes que nosotros controlamos.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ErrorDeUsuario) return void res.status(err.status).json({ error: err.message })
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (5 MB)' : err.message
    return void res.status(status).json({ error: mensaje })
  }
  console.error(err)
  res.status(500).json({ error: 'Error interno del servidor' })
})

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`)
})

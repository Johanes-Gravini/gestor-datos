import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

// En producción Express también sirve el frontend compilado (client/dist).
app.use(express.static(clientDist))
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
  res.sendFile(path.join(clientDist, 'index.html'))
})

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`)
})

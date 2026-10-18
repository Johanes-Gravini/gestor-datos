export interface Producto {
  id: number
  codigo: string
  nombre: string
  categoria: string
  precio: number
  stock: number
  creado_en: string
}

export interface Pagina {
  data: Producto[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type ColumnaOrden = 'codigo' | 'nombre' | 'categoria' | 'precio' | 'stock' | 'id'

export interface FiltrosProductos {
  q: string
  categoria: string
  page: number
  limit: number
  orden: ColumnaOrden
  dir: 'asc' | 'desc'
}

export interface ResultadoImportacion {
  filasLeidas: number
  insertadas: number
  actualizadas: number
  errores: { fila: number; motivo: string }[]
  erroresTotal: number
}

export class ApiError extends Error {
  constructor(
    mensaje: string,
    public status: number,
  ) {
    super(mensaje)
  }
}

async function mensajeDeError(res: Response): Promise<string> {
  try {
    const cuerpo = (await res.json()) as { error?: string }
    if (cuerpo.error) return cuerpo.error
  } catch {
    // la respuesta no era JSON (por ejemplo, un error de un proxy)
  }
  return `Error ${res.status} al contactar con el servidor`
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new ApiError(await mensajeDeError(res), res.status)
  return (await res.json()) as T
}

export function listarProductos(filtros: FiltrosProductos, signal?: AbortSignal): Promise<Pagina> {
  const params = new URLSearchParams({
    page: String(filtros.page),
    limit: String(filtros.limit),
    orden: filtros.orden,
    dir: filtros.dir,
  })
  if (filtros.q.trim()) params.set('q', filtros.q.trim())
  if (filtros.categoria) params.set('categoria', filtros.categoria)
  return pedir<Pagina>(`/api/productos?${params}`, { signal })
}

export function listarCategorias(): Promise<string[]> {
  return pedir<string[]>('/api/productos/categorias')
}

export async function importarArchivo(archivo: File): Promise<ResultadoImportacion> {
  const formulario = new FormData()
  formulario.append('archivo', archivo)
  const res = await fetch('/api/importar', { method: 'POST', body: formulario })
  // Un 422 significa "ninguna fila válida" y trae igualmente el reporte con los errores.
  if (res.ok || res.status === 422) {
    const cuerpo = (await res.json()) as ResultadoImportacion
    if ('filasLeidas' in cuerpo) return cuerpo
  }
  throw new ApiError(await mensajeDeError(res), res.status)
}

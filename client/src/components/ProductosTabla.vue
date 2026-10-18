<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { listarCategorias, listarProductos, type ColumnaOrden, type Pagina } from '@/api'

const props = defineProps<{ refrescar: number }>()

const columnas: { clave: ColumnaOrden; etiqueta: string; numerica?: boolean }[] = [
  { clave: 'codigo', etiqueta: 'Código' },
  { clave: 'nombre', etiqueta: 'Nombre' },
  { clave: 'categoria', etiqueta: 'Categoría' },
  { clave: 'precio', etiqueta: 'Precio', numerica: true },
  { clave: 'stock', etiqueta: 'Stock', numerica: true },
]

const q = ref('')
const categoria = ref('')
const page = ref(1)
const limit = ref(10)
const orden = ref<ColumnaOrden>('id')
const dir = ref<'asc' | 'desc'>('asc')

const categorias = ref<string[]>([])
const resultado = ref<Pagina | null>(null)
const cargando = ref(false)
const error = ref('')

const dinero = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const entero = new Intl.NumberFormat('es')

// Si el usuario cambia filtros rápido, la respuesta vieja no debe pisar a la nueva.
let controlador: AbortController | null = null

async function cargar() {
  controlador?.abort()
  const actual = new AbortController()
  controlador = actual
  cargando.value = true
  error.value = ''
  try {
    resultado.value = await listarProductos(
      {
        q: q.value,
        categoria: categoria.value,
        page: page.value,
        limit: limit.value,
        orden: orden.value,
        dir: dir.value,
      },
      actual.signal,
    )
  } catch (e) {
    if (actual.signal.aborted) return
    error.value = e instanceof Error ? e.message : 'No se pudo cargar la lista'
  } finally {
    if (controlador === actual) cargando.value = false
  }
}

async function cargarCategorias() {
  try {
    categorias.value = await listarCategorias()
  } catch {
    // el filtro de categorías es opcional: si falla, la tabla sigue funcionando
  }
}

let temporizador: ReturnType<typeof setTimeout> | undefined

// Los cambios de filtro vuelven a la página 1. La búsqueda espera a que termines de escribir.
function programar(espera: number) {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => {
    page.value = 1
    void cargar()
  }, espera)
}

watch(q, () => programar(300))
watch([categoria, limit, orden, dir], () => programar(0))

watch(
  () => props.refrescar,
  () => {
    void cargarCategorias()
    void cargar()
  },
)

function irAPagina(n: number) {
  page.value = n
  void cargar()
}

function ordenarPor(clave: ColumnaOrden) {
  if (orden.value === clave) {
    dir.value = dir.value === 'asc' ? 'desc' : 'asc'
  } else {
    orden.value = clave
    dir.value = 'asc'
  }
}

function ariaSort(clave: ColumnaOrden) {
  if (orden.value !== clave) return 'none'
  return dir.value === 'asc' ? 'ascending' : 'descending'
}

const hayFiltros = computed(() => q.value.trim() !== '' || categoria.value !== '')

const rango = computed(() => {
  const r = resultado.value
  if (!r || r.total === 0) return ''
  const desde = (r.page - 1) * r.limit + 1
  const hasta = Math.min(r.page * r.limit, r.total)
  return `Mostrando ${entero.format(desde)}–${entero.format(hasta)} de ${entero.format(r.total)}`
})

function limpiarFiltros() {
  q.value = ''
  categoria.value = ''
}

onMounted(() => {
  void cargarCategorias()
  void cargar()
})

onUnmounted(() => {
  clearTimeout(temporizador)
  controlador?.abort()
})
</script>

<template>
  <section class="tarjeta" aria-labelledby="titulo-productos">
    <h2 id="titulo-productos">Productos</h2>

    <form class="filtros" role="search" @submit.prevent>
      <label class="campo campo--ancho">
        <span>Buscar</span>
        <input v-model="q" type="search" placeholder="Nombre o código" autocomplete="off" />
      </label>
      <label class="campo">
        <span>Categoría</span>
        <select v-model="categoria">
          <option value="">Todas</option>
          <option v-for="c in categorias" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="campo">
        <span>Por página</span>
        <select v-model.number="limit">
          <option :value="10">10</option>
          <option :value="25">25</option>
          <option :value="50">50</option>
        </select>
      </label>
    </form>

    <p v-if="error" class="aviso aviso--error" role="alert">
      {{ error }}
      <button type="button" @click="cargar">Reintentar</button>
    </p>

    <div class="contenedor-tabla" :aria-busy="cargando">
      <table>
        <thead>
          <tr>
            <th
              v-for="c in columnas"
              :key="c.clave"
              scope="col"
              :aria-sort="ariaSort(c.clave)"
              :class="{ num: c.numerica }"
            >
              <button type="button" class="orden" @click="ordenarPor(c.clave)">
                {{ c.etiqueta }}
                <span aria-hidden="true" class="flecha">{{
                  orden === c.clave ? (dir === 'asc' ? '▲' : '▼') : ''
                }}</span>
              </button>
            </th>
          </tr>
        </thead>
        <tbody :class="{ cargando }">
          <tr v-for="p in resultado?.data ?? []" :key="p.id">
            <td>{{ p.codigo }}</td>
            <td>{{ p.nombre }}</td>
            <td>{{ p.categoria }}</td>
            <td class="num">{{ dinero.format(p.precio) }}</td>
            <td class="num">{{ entero.format(p.stock) }}</td>
          </tr>
          <tr v-if="resultado && resultado.data.length === 0" class="vacio">
            <td :colspan="columnas.length">
              <template v-if="hayFiltros">
                Ningún producto coincide con tu búsqueda.
                <button type="button" @click="limpiarFiltros">Quitar filtros</button>
              </template>
              <template v-else
                >Todavía no hay productos. Sube un archivo Excel para empezar.</template
              >
            </td>
          </tr>
          <tr v-if="!resultado && cargando" class="vacio">
            <td :colspan="columnas.length">Cargando…</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="resultado" class="paginacion" aria-label="Paginación">
      <span class="rango" aria-live="polite">{{ rango }}</span>
      <div class="botones">
        <button
          type="button"
          :disabled="resultado.page <= 1"
          @click="irAPagina(resultado.page - 1)"
        >
          Anterior
        </button>
        <span>Página {{ resultado.page }} de {{ resultado.totalPages }}</span>
        <button
          type="button"
          :disabled="resultado.page >= resultado.totalPages"
          @click="irAPagina(resultado.page + 1)"
        >
          Siguiente
        </button>
      </div>
    </nav>
  </section>
</template>

<style scoped>
.filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin: 1rem 0;
}

.campo {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  color: var(--texto-suave);
}

.campo--ancho {
  flex: 1 1 14rem;
}

.contenedor-tabla {
  overflow-x: auto;
  border: 1px solid var(--borde);
  border-radius: var(--radio);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
}

th,
td {
  padding: 0.6rem 0.85rem;
  text-align: left;
  white-space: nowrap;
}

thead th {
  padding: 0;
  background: var(--acento-suave);
  border-bottom: 1px solid var(--borde);
}

tbody tr + tr td {
  border-top: 1px solid var(--borde);
}

.num {
  text-align: right;
}

.orden {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.6rem 0.85rem;
  background: transparent;
  border: 0;
  border-radius: 0;
  font-weight: 600;
}

.num .orden {
  justify-content: flex-end;
}

.flecha {
  min-width: 1em;
  font-size: 0.7rem;
  color: var(--acento);
}

tbody.cargando {
  opacity: 0.55;
}

.vacio td {
  padding: 2rem;
  text-align: center;
  color: var(--texto-suave);
  white-space: normal;
}

.paginacion {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
}

.rango {
  color: var(--texto-suave);
  font-size: 0.9rem;
}

.botones {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
</style>

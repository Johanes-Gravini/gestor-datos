<script setup lang="ts">
import { computed, ref } from 'vue'
import { importarArchivo, type ResultadoImportacion } from '@/api'

const emit = defineEmits<{ importado: [] }>()

const MAX_BYTES = 5 * 1024 * 1024
const EXTENSIONES = ['.xlsx', '.csv']

const entrada = ref<HTMLInputElement | null>(null)
const archivo = ref<File | null>(null)
const arrastrando = ref(false)
const subiendo = ref(false)
const error = ref('')
const resultado = ref<ResultadoImportacion | null>(null)

const tamano = computed(() => {
  const f = archivo.value
  if (!f) return ''
  return f.size < 1024 * 1024
    ? `${(f.size / 1024).toFixed(1)} KB`
    : `${(f.size / 1024 / 1024).toFixed(1)} MB`
})

// Validamos antes de subir para ahorrar la espera, pero el servidor vuelve a validar todo.
function elegir(f: File | null | undefined) {
  resultado.value = null
  error.value = ''
  archivo.value = null
  if (!f) return
  const nombre = f.name.toLowerCase()
  if (!EXTENSIONES.some((ext) => nombre.endsWith(ext))) {
    error.value = 'Solo se aceptan archivos .xlsx o .csv.'
    return
  }
  if (f.size > MAX_BYTES) {
    error.value = 'El archivo supera el máximo de 5 MB.'
    return
  }
  archivo.value = f
}

function alElegir(e: Event) {
  elegir((e.target as HTMLInputElement).files?.[0])
}

function alSoltar(e: DragEvent) {
  arrastrando.value = false
  elegir(e.dataTransfer?.files[0])
}

async function subir() {
  if (!archivo.value || subiendo.value) return
  subiendo.value = true
  error.value = ''
  resultado.value = null
  try {
    resultado.value = await importarArchivo(archivo.value)
    if (resultado.value.insertadas + resultado.value.actualizadas > 0) emit('importado')
    archivo.value = null
    if (entrada.value) entrada.value.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo subir el archivo.'
  } finally {
    subiendo.value = false
  }
}
</script>

<template>
  <section class="tarjeta" aria-labelledby="titulo-importar">
    <h2 id="titulo-importar">Importar desde Excel</h2>
    <p class="ayuda">
      Columnas requeridas: <code>codigo, nombre, categoria, precio, stock</code>. Si un código ya
      existe, se actualiza.
      <a href="/api/importar/plantilla" download>Descargar plantilla</a>
    </p>

    <label
      class="zona"
      :class="{ 'zona--activa': arrastrando }"
      @dragover.prevent="arrastrando = true"
      @dragleave="arrastrando = false"
      @drop.prevent="alSoltar"
    >
      <input
        ref="entrada"
        class="solo-lectores"
        type="file"
        accept=".xlsx,.csv"
        @change="alElegir"
      />
      <template v-if="archivo">
        <strong>{{ archivo.name }}</strong>
        <span>{{ tamano }}</span>
      </template>
      <template v-else>
        <strong>Arrastra un archivo aquí o haz clic para elegirlo</strong>
        <span>.xlsx o .csv, máximo 5 MB</span>
      </template>
    </label>

    <div class="acciones">
      <button type="button" class="primario" :disabled="!archivo || subiendo" @click="subir">
        {{ subiendo ? 'Subiendo…' : 'Subir archivo' }}
      </button>
    </div>

    <p v-if="error" class="aviso aviso--error" role="alert">{{ error }}</p>

    <div v-if="resultado" class="resultado" role="status">
      <p
        class="aviso"
        :class="resultado.insertadas + resultado.actualizadas > 0 ? 'aviso--ok' : 'aviso--error'"
      >
        {{ resultado.filasLeidas }} filas leídas ·
        <strong>{{ resultado.insertadas }}</strong> nuevas ·
        <strong>{{ resultado.actualizadas }}</strong> actualizadas ·
        <strong>{{ resultado.erroresTotal }}</strong> con errores
      </p>

      <div v-if="resultado.errores.length" class="errores">
        <table>
          <caption>
            Filas rechazadas
            <template v-if="resultado.erroresTotal > resultado.errores.length">
              (se muestran {{ resultado.errores.length }} de {{ resultado.erroresTotal }})
            </template>
          </caption>
          <thead>
            <tr>
              <th scope="col">Fila</th>
              <th scope="col">Motivo</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in resultado.errores" :key="e.fila">
              <td>{{ e.fila }}</td>
              <td>{{ e.motivo }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ayuda {
  margin: 0.5rem 0 1rem;
  color: var(--texto-suave);
  font-size: 0.9rem;
}

code {
  padding: 0.1rem 0.35rem;
  background: var(--acento-suave);
  border-radius: 4px;
  font-size: 0.85em;
  overflow-wrap: anywhere;
}

.zona {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 1.5rem 1rem;
  text-align: center;
  border: 2px dashed var(--borde);
  border-radius: var(--radio);
  cursor: pointer;
  color: var(--texto-suave);
}

.zona strong {
  color: var(--texto);
  overflow-wrap: anywhere;
}

.zona:hover,
.zona--activa,
.zona:focus-within {
  border-color: var(--acento);
  background: var(--acento-suave);
}

.acciones {
  margin: 1rem 0;
}

.resultado {
  display: grid;
  gap: 0.75rem;
}

.errores {
  max-height: 16rem;
  overflow: auto;
  border: 1px solid var(--borde);
  border-radius: var(--radio);
}

caption {
  padding: 0.6rem 0.85rem;
  text-align: left;
  font-weight: 600;
  background: var(--acento-suave);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.45rem 0.85rem;
  text-align: left;
}

th:first-child,
td:first-child {
  width: 4.5rem;
}

tbody tr + tr td {
  border-top: 1px solid var(--borde);
}
</style>

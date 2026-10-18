<script setup lang="ts">
import { ref } from 'vue'
import ImportarExcel from '@/components/ImportarExcel.vue'
import ProductosTabla from '@/components/ProductosTabla.vue'

// Cada importación exitosa incrementa el contador; la tabla lo observa y se recarga.
const refrescar = ref(0)
</script>

<template>
  <header class="cabecera">
    <h1>Gestor de datos</h1>
    <p>Importa productos desde Excel, búscalos y revisa tu inventario.</p>
  </header>

  <main class="contenido">
    <ImportarExcel @importado="refrescar++" />
    <ProductosTabla :refrescar="refrescar" />
  </main>
</template>

<style scoped>
.cabecera {
  max-width: 64rem;
  margin: 0 auto;
  padding: 2rem 1rem 1rem;
}

.cabecera p {
  margin: 0.25rem 0 0;
  color: var(--texto-suave);
}

.contenido {
  display: grid;
  /* minmax(0, 1fr) deja que las tarjetas se encojan; sin él, la tabla ancha estira la página. */
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
  max-width: 64rem;
  margin: 0 auto;
  padding: 0 1rem 3rem;
}
</style>

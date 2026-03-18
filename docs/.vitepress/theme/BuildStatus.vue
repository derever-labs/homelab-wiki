<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const buildTime = ref('')
let interval = null

function formatTimestamp(iso) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `Stand: ${day}.${month}. ${hours}:${minutes}`
}

async function fetchStatus() {
  try {
    const res = await fetch('/_webhook/status.json', { cache: 'no-store' })
    if (res.ok) {
      const data = await res.json()
      buildTime.value = formatTimestamp(data.timestamp)
    }
  } catch {
    // Endpoint nicht erreichbar (lokal / offline)
  }
}

onMounted(() => {
  fetchStatus()
  interval = setInterval(fetchStatus, 10000)
})

onUnmounted(() => {
  if (interval) clearInterval(interval)
})
</script>

<template>
  <span v-if="buildTime" class="build-timestamp">{{ buildTime }}</span>
</template>

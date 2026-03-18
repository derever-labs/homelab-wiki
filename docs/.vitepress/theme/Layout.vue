<script setup>
import DefaultTheme from 'vitepress/theme'
import BuildStatus from './BuildStatus.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <BuildStatus />
    </template>
  </Layout>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { iconPaths, type IconName } from './icons';

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 20 });
const paths = computed(() => iconPaths(props.name));
</script>

<template>
  <svg class="vicon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.vicon { flex: none; display: inline-block; vertical-align: middle; }
</style>

<script setup lang="ts">
import AppShell from './components/shell/AppShell.vue';
import { useSettingsStore } from './stores/settings';

useSettingsStore(); // aplica o tema salvo
</script>

<template>
  <AppShell />
</template>

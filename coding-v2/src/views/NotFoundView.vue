<script setup lang="ts">
import { RouterLink } from 'vue-router';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';
</script>

<template>
  <PageHeader title="Página não encontrada" />
  <EmptyState title="Esse endereço não existe no Launcher." text="Volte ao início para continuar.">
    <RouterLink :to="{ name: 'home' }" class="btn btn-primary">Ir para o início</RouterLink>
  </EmptyState>
</template>

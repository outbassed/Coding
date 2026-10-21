<script setup lang="ts">
import { LEGACY_URL } from '../shared/links';
import PageHeader from '../components/ui/PageHeader.vue';
import EmptyState from '../components/ui/EmptyState.vue';
</script>

<template>
  <PageHeader eyebrow="Biblioteca" title="Documentos" />
  <EmptyState title="Seus documentos continuam protegidos." text="Esta prévia ainda não lê o banco do Coding atual, de propósito: primeiro vêm os testes de importação e backup. Continue abrindo, editando e exportando no site estável.">
    <a class="btn btn-primary" :href="LEGACY_URL">Ir para o Coding atual ↗</a>
  </EmptyState>
</template>

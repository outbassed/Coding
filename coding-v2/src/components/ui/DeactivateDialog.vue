<script setup lang="ts">
import { computed } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';
import { useActivation } from '../../composables/useActivation';
import { getTool } from '../../shared/catalog';

const { pending, confirm, cancel } = useActivation();
const name = computed(() => (pending.value ? getTool(pending.value).name : ''));
</script>

<template>
  <ConfirmDialog :open="pending !== null" :title="'Desativar ' + name + '?'" confirm-label="Desativar atalho" @confirm="confirm" @cancel="cancel">
    <p>Isso remove só o atalho de {{ name }} deste Launcher. Seus documentos não são apagados e você pode ativar de novo quando quiser.</p>
  </ConfirmDialog>
</template>

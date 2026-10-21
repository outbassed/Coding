import { ref } from 'vue';
import { getTool, type ToolId } from '../shared/catalog';
import { useAppsStore } from '../stores/apps';
import { useAnnouncer } from './useAnnouncer';

const pending = ref<ToolId | null>(null);

/** Ativar é imediato; desativar pede confirmação (diálogo montado no AppShell). */
export function useActivation() {
  const apps = useAppsStore();
  const { say } = useAnnouncer();

  function request(id: ToolId): void {
    if (apps.isEnabled(id)) { pending.value = id; return; }
    if (apps.toggle(id)) void say(getTool(id).name + ' ativado no Launcher.');
  }
  function confirm(): void {
    const id = pending.value;
    pending.value = null;
    if (id && apps.toggle(id)) void say(getTool(id).name + ' desativado. Seus documentos não foram removidos.');
  }
  function cancel(): void { pending.value = null; }
  return { pending, request, confirm, cancel };
}

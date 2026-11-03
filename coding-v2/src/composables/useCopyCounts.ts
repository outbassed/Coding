import { computed, onMounted, ref } from 'vue';
import { tools } from '../shared/catalog';
import { listCopySummaries, type CopySummary } from '../storage/documents';
import { toolIdForType } from '../library/model';
import { appKeyForType } from '../workspace/limits';

async function dbExists(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    if (typeof indexedDB.databases !== 'function') return true;
    return (await indexedDB.databases()).some((d) => d.name === 'coding-v2-documents');
  } catch { return false; }
}

/** Contagem de documentos por app, só leitura: não cria o banco se ele ainda não existir. */
export function useCopyCounts() {
  const copies = ref<CopySummary[] | null>(null);
  onMounted(async () => { try { copies.value = (await dbExists()) ? await listCopySummaries() : []; } catch { copies.value = null; } });
  const counts = computed<Record<string, number> | null>(() => {
    if (!copies.value) return null;
    const result: Record<string, number> = {};
    for (const c of copies.value) { const k = appKeyForType(c.type); result[k] = (result[k] ?? 0) + 1; }
    return result;
  });
  const perApp = computed(() => tools.map((t) => ({ tool: t, count: (copies.value ?? []).filter((c) => toolIdForType(c.type) === t.id).length })));
  return { copies, counts, perApp };
}

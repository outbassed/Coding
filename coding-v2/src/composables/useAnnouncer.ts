import { nextTick, ref } from 'vue';

const message = ref('');

/** Região aria-live compartilhada: anuncia mudanças que não movem o foco. */
export function useAnnouncer() {
  async function say(text: string): Promise<void> {
    message.value = '';
    await nextTick();
    message.value = text;
  }
  return { message, say };
}

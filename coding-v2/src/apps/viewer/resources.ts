import { onBeforeUnmount, ref } from 'vue';

/** Endereço temporário (blob:) de um arquivo, liberado sozinho ao trocar de arquivo ou fechar o visualizador. */
export function useObjectUrl() {
  const url = ref('');
  function clear(): void {
    if (url.value.startsWith('blob:')) URL.revokeObjectURL(url.value);
    url.value = '';
  }
  function set(blob: Blob | null): string {
    clear();
    if (blob) url.value = URL.createObjectURL(blob);
    return url.value;
  }
  onBeforeUnmount(clear);
  return { url, set, clear };
}

/** Desenha o conteúdo de um canvas num PNG. Lança erro com texto claro quando a origem da imagem não permite (canvas "sujo"). */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('O navegador não conseguiu gerar a imagem.'));
      }, 'image/png');
    } catch {
      reject(new Error('O servidor desta mídia não permite copiar ou capturar o conteúdo. Baixe o arquivo e abra-o pelo aparelho.'));
    }
  });
}

/** O alvo da tecla é um campo (ou controle que usa as próprias setas)? Atalhos do Visualizador não devem roubar essas teclas. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !['button', 'checkbox', 'radio', 'color', 'file', 'submit', 'reset'].includes((el as HTMLInputElement).type);
  return false;
}

import { onBeforeUnmount, onMounted } from 'vue';

/**
 * Acompanha a área realmente visível (muda quando o teclado do celular abre) e a expõe em
 * --vv-h / --vv-top, para a tela de edição caber acima do teclado em vez de ficar escondida atrás dele.
 */
export function useVisualViewport(target: () => HTMLElement | null = () => document.documentElement): void {
  let frame = 0;
  const apply = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const vv = window.visualViewport;
      const el = target();
      if (!vv || !el) return;
      el.style.setProperty('--vv-h', Math.round(vv.height) + 'px');
      el.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px');
    });
  };
  onMounted(() => {
    apply();
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener('resize', apply);
    window.visualViewport?.removeEventListener('scroll', apply);
    window.removeEventListener('orientationchange', apply);
  });
}

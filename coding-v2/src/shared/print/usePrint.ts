import { onBeforeUnmount, onMounted } from 'vue';
import { getPrintProvider, setPrintProvider, type PrintProvider } from './print';

/** Registra como o aplicativo imprime enquanto o componente estiver na tela. */
export function usePrint(provider: PrintProvider): void {
  onMounted(() => setPrintProvider(provider));
  onBeforeUnmount(() => { if (getPrintProvider() === provider) setPrintProvider(null); });
}

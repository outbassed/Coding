import { onBeforeUnmount, ref, type Ref } from 'vue';

/** Segue uma media query. Sem matchMedia (testes), usa o valor inicial. */
export function useMediaQuery(query: string, initial = true): Ref<boolean> {
  const matches = ref(initial);
  if (typeof matchMedia !== 'function') return matches;
  const mql = matchMedia(query);
  matches.value = mql.matches;
  const onChange = (event: MediaQueryListEvent) => { matches.value = event.matches; };
  mql.addEventListener('change', onChange);
  onBeforeUnmount(() => mql.removeEventListener('change', onChange));
  return matches;
}

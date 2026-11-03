/** Modelo de documento: cria um estado inicial editável, sem precisar enviar arquivo algum. */
export interface DocTemplate<S> {
  id: string;
  name: string;
  description: string;
  create(): S;
}
export function findTemplate<S>(list: readonly DocTemplate<S>[], id: string | null): DocTemplate<S> | undefined {
  return id ? list.find((t) => t.id === id) : undefined;
}

import { COPIES_DB_NAME } from '../storage/documents';

/**
 * O documento existe na biblioteca? Só leitura, sem nunca criar nem alterar o banco: se ele não existir, o `open`
 * é abortado no `onupgradeneeded` (o navegador desfaz a criação). Usado pela retomada para não abrir um aplicativo
 * que mostraria "documento não encontrado".
 */
export async function copyExists(id: string, timeoutMs = 1500): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  try {
    if (typeof indexedDB.databases === 'function' && !(await indexedDB.databases()).some((d) => d.name === COPIES_DB_NAME)) return false;
  } catch { return false; }
  const lookup = new Promise<boolean>((resolve) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(COPIES_DB_NAME); } catch { resolve(false); return; }
    request.onupgradeneeded = () => { request.transaction?.abort(); }; // não existia: não cria nada
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      try {
        if (!db.objectStoreNames.contains('copies')) { db.close(); resolve(false); return; }
        const get = db.transaction('copies', 'readonly').objectStore('copies').get(id);
        get.onsuccess = () => { db.close(); resolve(get.result !== undefined); };
        get.onerror = () => { db.close(); resolve(false); };
      } catch { db.close(); resolve(false); }
    };
  });
  const timeout = new Promise<boolean>((resolve) => { setTimeout(() => resolve(false), timeoutMs); });
  return Promise.race([lookup, timeout]);
}

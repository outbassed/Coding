import { historyPath, targetFromSlug, type VersionTarget } from '../shared/versions';

export type Located = { kind: 'target'; target: VersionTarget; canonical: boolean } | { kind: 'unknown'; slug: string };

/**
 * Interpreta o caminho da Central: `/versoes/` (Launcher), `/versoes/<slug>/` e o alias `/versions/…`.
 * `canonical` é falso quando o endereço deve ser trocado (sem recarregar a página) pelo oficial — por exemplo
 * `/versions/`, `/versoes` ou `/versoes/launcher/` → `/versoes/`.
 */
export function locate(pathname: string): Located {
  const parts = pathname.split('/').filter(Boolean);
  const first = parts[0];
  if (first !== 'versoes' && first !== 'versions') return { kind: 'target', target: 'launcher', canonical: false };
  let slug = '';
  try { slug = decodeURIComponent(parts[1] ?? '').toLowerCase(); } catch { slug = parts[1] ?? ''; }
  if (parts.length > 2) return { kind: 'unknown', slug };
  const target = slug === '' || slug === 'launcher' ? 'launcher' : targetFromSlug(slug);
  if (!target) return { kind: 'unknown', slug };
  return { kind: 'target', target, canonical: pathname === historyPath(target) };
}

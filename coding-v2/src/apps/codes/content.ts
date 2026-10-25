/**
 * Montagem do conteúdo de um QR code a partir de campos (Wi-Fi, contato, e-mail…).
 * Funções puras: devolvem o texto exato que vai dentro do QR ou uma mensagem de erro em português.
 */
export type Built = { ok: true; value: string } | { ok: false; error: string };
const ok = (value: string): Built => ({ ok: true, value });
const fail = (error: string): Built => ({ ok: false, error });

/** Wi-Fi: \ ; , : " são escapados com barra invertida (formato do ZXing, aceito por Android e iOS). */
const wifiEsc = (s: string): string => s.replace(/([\\;,:"])/g, '\\$1');
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
export function buildWifi(o: { ssid: string; password: string; security: WifiSecurity; hidden: boolean }): Built {
  const ssid = o.ssid.trim();
  if (!ssid) return fail('Digite o nome da rede (SSID).');
  if (ssid.length > 32) return fail('O nome da rede tem no máximo 32 caracteres.');
  if (o.security === 'nopass') return ok('WIFI:T:nopass;S:' + wifiEsc(ssid) + ';' + (o.hidden ? 'H:true;' : '') + ';');
  if (!o.password) return fail('Digite a senha ou escolha “Sem senha”.');
  if (o.security === 'WPA' && (o.password.length < 8 || o.password.length > 63)) return fail('A senha WPA precisa ter de 8 a 63 caracteres.');
  return ok('WIFI:T:' + o.security + ';S:' + wifiEsc(ssid) + ';P:' + wifiEsc(o.password) + ';' + (o.hidden ? 'H:true;' : '') + ';');
}

export function buildUrl(raw: string): Built {
  const v = raw.trim();
  if (!v) return fail('Digite o endereço do site.');
  if (/[\s\u0000-\u001f]/.test(v)) return fail('O endereço não pode ter espaços.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v) && !/^[^/]*\.[^/]*:\d/.test(v)) return fail('Use um endereço http:// ou https://.');
  const full = /^https?:\/\//i.test(v) ? v : 'https://' + v;
  try {
    const url = new URL(full);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return fail('Endereço incompleto. Exemplo: exemplo.com.br');
    return ok(url.href);
  } catch { return fail('Endereço inválido. Exemplo: https://exemplo.com.br'); }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function buildEmail(o: { to: string; subject: string; body: string }): Built {
  const to = o.to.trim();
  if (!EMAIL.test(to)) return fail('Digite um e-mail válido, como nome@exemplo.com.');
  const parts: string[] = [];
  if (o.subject.trim()) parts.push('subject=' + encodeURIComponent(o.subject.trim()));
  if (o.body.trim()) parts.push('body=' + encodeURIComponent(o.body.trim()));
  return ok('mailto:' + to + (parts.length ? '?' + parts.join('&') : ''));
}

/** Telefone: só dígitos e um + inicial; entre 8 e 15 dígitos (E.164). */
export function normalizePhone(raw: string): string | null {
  const plus = raw.trim().startsWith('+') ? '+' : '';
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? plus + digits : null;
}
export function buildPhone(raw: string): Built {
  const p = normalizePhone(raw);
  return p ? ok('tel:' + p) : fail('Digite um telefone com 8 a 15 dígitos (com DDD; use + para código do país).');
}
export function buildSms(o: { phone: string; message: string }): Built {
  const p = normalizePhone(o.phone);
  if (!p) return fail('Digite um telefone com 8 a 15 dígitos (com DDD).');
  return ok('SMSTO:' + p + ':' + o.message.trim().slice(0, 300));
}

/** vCard 3.0: vírgula, ponto e vírgula, barra invertida e quebras de linha são escapados. */
const vEsc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([;,])/g, '\\$1');
export function buildVcard(o: { name: string; org: string; phone: string; email: string; url: string }): Built {
  const name = o.name.trim();
  if (!name) return fail('Digite o nome do contato.');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const words = name.split(/\s+/);
  const last = words.length > 1 ? words[words.length - 1]! : '';
  const first = words.length > 1 ? words.slice(0, -1).join(' ') : name;
  lines.push('N:' + vEsc(last) + ';' + vEsc(first) + ';;;', 'FN:' + vEsc(name));
  if (o.org.trim()) lines.push('ORG:' + vEsc(o.org.trim()));
  if (o.phone.trim()) {
    const p = normalizePhone(o.phone);
    if (!p) return fail('Telefone inválido: use 8 a 15 dígitos.');
    lines.push('TEL:' + p);
  }
  if (o.email.trim()) {
    if (!EMAIL.test(o.email.trim())) return fail('E-mail inválido.');
    lines.push('EMAIL:' + o.email.trim());
  }
  if (o.url.trim()) {
    const u = buildUrl(o.url);
    if (!u.ok) return u;
    lines.push('URL:' + u.value);
  }
  lines.push('END:VCARD');
  return ok(lines.join('\n'));
}

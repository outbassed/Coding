import { describe, expect, it } from 'vitest';
import { buildEmail, buildPhone, buildSms, buildUrl, buildVcard, buildWifi, normalizePhone } from './content';

describe('conteúdo de QR code', () => {
  it('Wi-Fi: escapa caracteres especiais, oculta, sem senha e valida', () => {
    expect(buildWifi({ ssid: 'Casa', password: 'senha1234', security: 'WPA', hidden: false })).toEqual({ ok: true, value: 'WIFI:T:WPA;S:Casa;P:senha1234;;' });
    expect(buildWifi({ ssid: 'A;B:"C"', password: 'p\\a;ss,wo:rd', security: 'WPA', hidden: true })).toEqual({ ok: true, value: 'WIFI:T:WPA;S:A\\;B\\:\\"C\\";P:p\\\\a\\;ss\\,wo\\:rd;H:true;;' });
    expect(buildWifi({ ssid: 'Aberta', password: '', security: 'nopass', hidden: false })).toEqual({ ok: true, value: 'WIFI:T:nopass;S:Aberta;;' });
    expect(buildWifi({ ssid: '', password: 'x', security: 'WEP', hidden: false }).ok).toBe(false);
    expect(buildWifi({ ssid: 'X', password: 'curta', security: 'WPA', hidden: false }).ok).toBe(false);
    expect(buildWifi({ ssid: 'X', password: '', security: 'WEP', hidden: false }).ok).toBe(false);
    expect(buildWifi({ ssid: 'X'.repeat(33), password: '12345678', security: 'WPA', hidden: false }).ok).toBe(false);
  });
  it('site: completa https e recusa outros esquemas', () => {
    expect(buildUrl('exemplo.com.br/loja')).toEqual({ ok: true, value: 'https://exemplo.com.br/loja' });
    expect(buildUrl('http://a.com')).toEqual({ ok: true, value: 'http://a.com/' });
    expect(buildUrl('exemplo.com:8080')).toEqual({ ok: true, value: 'https://exemplo.com:8080/' });
    expect(buildUrl('javascript:alert(1)').ok).toBe(false);
    expect(buildUrl('ftp://x.com').ok).toBe(false);
    expect(buildUrl('com espaço.com').ok).toBe(false);
    expect(buildUrl('semponto').ok).toBe(false);
    expect(buildUrl('').ok).toBe(false);
  });
  it('e-mail, telefone e SMS', () => {
    expect(buildEmail({ to: 'a@b.com', subject: 'Olá & tchau', body: 'Linha 1\nLinha 2' })).toEqual({ ok: true, value: 'mailto:a@b.com?subject=Ol%C3%A1%20%26%20tchau&body=Linha%201%0ALinha%202' });
    expect(buildEmail({ to: 'a@b.com', subject: '', body: '' })).toEqual({ ok: true, value: 'mailto:a@b.com' });
    expect(buildEmail({ to: 'sem-arroba', subject: '', body: '' }).ok).toBe(false);
    expect(normalizePhone('(11) 91234-5678')).toBe('11912345678');
    expect(normalizePhone('+55 11 91234-5678')).toBe('+5511912345678');
    expect(normalizePhone('123')).toBeNull();
    expect(buildPhone('+55 (11) 91234-5678')).toEqual({ ok: true, value: 'tel:+5511912345678' });
    expect(buildPhone('abc').ok).toBe(false);
    expect(buildSms({ phone: '11 91234-5678', message: 'Oi!' })).toEqual({ ok: true, value: 'SMSTO:11912345678:Oi!' });
    expect(buildSms({ phone: '1', message: 'x' }).ok).toBe(false);
  });
  it('vCard: campos escapados e validados', () => {
    const r = buildVcard({ name: 'Maria da Silva', org: 'Loja, Filial; Centro', phone: '+55 11 91234-5678', email: 'maria@exemplo.com', url: 'exemplo.com' });
    expect(r.ok && r.value).toBe('BEGIN:VCARD\nVERSION:3.0\nN:Silva;Maria da;;;\nFN:Maria da Silva\nORG:Loja\\, Filial\\; Centro\nTEL:+5511912345678\nEMAIL:maria@exemplo.com\nURL:https://exemplo.com/\nEND:VCARD');
    const single = buildVcard({ name: 'Cher', org: '', phone: '', email: '', url: '' });
    expect(single.ok && single.value).toContain('N:;Cher;;;');
    expect(buildVcard({ name: '', org: '', phone: '', email: '', url: '' }).ok).toBe(false);
    expect(buildVcard({ name: 'X', org: '', phone: '12', email: '', url: '' }).ok).toBe(false);
    expect(buildVcard({ name: 'X', org: '', phone: '', email: 'ruim', url: '' }).ok).toBe(false);
  });
});

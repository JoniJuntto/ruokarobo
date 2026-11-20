export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export const esc = (t: unknown) => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
export const setText = (id: string, v: unknown) => { const el = $(id), s = String(v); if (el.textContent !== s) el.textContent = s; };

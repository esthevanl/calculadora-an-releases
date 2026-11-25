// Utilitários numéricos e de texto compartilhados por todos os módulos (sem DOM: testáveis em Node).

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const decimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lê valores monetários digitados ou extraídos de PDF.
 * Aceita "1.234,56", "1234,56", "1234.56", "1.234", "R$ 1.234". Retorna null se vazio/inválido.
 */
export function parseMoneyOrNull(value) {
  let text = String(value ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (!text) return null;
  const negative = text.startsWith('-');
  if (negative) text = text.slice(1);
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(text)) text = text.replace(/\./g, '');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? (negative ? -number : number) : null;
}

/** Igual a parseMoneyOrNull, mas devolve 0 para vazio/inválido e nunca negativo. */
export const parseMoney = (value) => Math.max(0, parseMoneyOrNull(value) ?? 0);

export const formatBRL = (value) => brl.format(value || 0);
export const formatNumber = (value) => decimal2.format(value || 0);
/** Despreza frações de centavo (critério do programa da Receita). */
export const floorCent = (value) => Math.floor((Math.max(0, value) + 1e-8) * 100) / 100;
export const roundCent = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export const stripAccents = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normalizeName = (value) => stripAccents(value).toUpperCase().replace(/\s+/g, ' ').trim();
export const cleanText = (value) => String(value ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export const MONEY_PATTERN = '[\\d.]+,\\d{2}';

/** Datas ISO (AAAA-MM-DD) para exibição dd/mm/aaaa. */
export const formatDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');

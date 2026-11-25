// Formatação do teor das publicações para leitura (sem DOM: testável em Node).
// O DJEN entrega o teor num bloco só; aqui ele vira parágrafos, com o cabeçalho separado e os prazos destacados.
import { escapeHtml } from '../core/money.js';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekday = (iso) => WEEKDAYS[new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).getUTCDay()] || '';

// Onde começa o texto do juiz (o que vem antes é o cabeçalho do tribunal: partes, advogados).
const BODY_START = /\b(DECIS[AÃ]O|SENTEN[CÇ]A|DESPACHO|ATO ORDINAT[OÓ]RIO|INTIMA[CÇ][AÃ]O)\b(?=\s+[A-ZÀ-Ú][a-zà-ú])/;
// Quebras de parágrafo antes destas expressões.
const BREAKS = [
  /\s(?=É o relat[óo]rio\.)/g, /\s(?=Decido\.)/g, /\s(?=Pois bem\.)/g, /\s(?=Ante o exposto)/g, /\s(?=Diante do exposto)/g, /\s(?=Isto posto)/g,
  /\s(?=Posto isso)/g, /\s(?=CITE-SE)/g, /\s(?=Intime-se)/g, /\s(?=Intimem-se)/g, /\s(?=Cumpra-se)/g, /\s(?=Fica desde logo)/g,
  /\s(?=Quanto [àa] produ[çc][ãa]o)/g, /\s(?=C[óo]pia do presente)/g, /\s(?=Porto Velho, \w+-feira)/g, /\s(?=\d{1,2} ?[-–] ?(?:[a-zà-ú]|se\b))/g,
  /\s(?=[a-e]\. (?:Intima|Cita))/g
];

/**
 * Divide o teor em { header, paragraphs }.
 * header: o trecho de identificação (tribunal, partes, advogados) até a palavra DECISÃO/SENTENÇA/DESPACHO.
 */
export function teorParts(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return { header: '', title: '', paragraphs: [] };
  const m = t.match(BODY_START);
  let header = ''; let title = ''; let body = t;
  if (m && m.index < 900) { header = t.slice(0, m.index).trim(); title = m[1]; body = t.slice(m.index + m[0].length).trim(); }
  let marked = body;
  for (const re of BREAKS) marked = marked.replace(re, '\n');
  const paragraphs = marked.split('\n').map((p) => p.trim()).filter(Boolean);
  return { header, title, paragraphs };
}

const DEADLINE = /\b(?:no\s+)?prazo\s+(?:comum\s+)?(?:de\s+defesa\s+)?(?:de\s+)?(?:\d{1,3}|um|uma|dois|duas|tr[eê]s|cinco|dez|quinze|vinte|trinta|sessenta)(?:\s*\([^)]{1,20}\))?\s+(?:dias?(?:\s+[úu]teis|\s+corridos)?|horas)\b/gi;
const PENALTY = /\bsob pena de [^.,;]{3,60}/gi;

/** HTML seguro de um parágrafo, com os prazos e as cominações destacados. */
export function paragraphHtml(p, { chosenDays = null } = {}) {
  let html = escapeHtml(p);
  html = html.replace(DEADLINE, (s) => {
    const chosen = chosenDays != null && new RegExp(`\\b${Number(chosenDays)}\\b`).test(s);
    return `<mark class="pub-deadline${chosen ? ' chosen' : ''}" title="${chosen ? 'Prazo usado pelo app' : 'Prazo no texto'}">${s}</mark>`;
  });
  html = html.replace(PENALTY, (s) => `<em class="pub-penalty">${s}</em>`);
  return html;
}

/** Resumo fechado: o primeiro parágrafo e os que trazem prazo (índices, em ordem). */
export function keyParagraphs(paragraphs) {
  const keep = paragraphs.map((p, i) => (i === 0 || new RegExp(DEADLINE.source, 'i').test(p) ? i : -1)).filter((i) => i >= 0);
  return keep.slice(0, 4);
}

/** Polo do DJEN ('A', 'P', 'T'...) em texto. */
export const poloLabel = (p) => ({ A: 'Polo ativo', P: 'Polo passivo', T: 'Terceiro', I: 'Interessado' })[String(p || '').toUpperCase()] || 'Parte';

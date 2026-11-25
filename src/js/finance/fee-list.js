// Lista do Financeiro no padrão das telas de "contas a receber" (Conta Azul, QuickBooks, Stripe): agrupada por mês
// de vencimento, cliente em destaque com a descrição embaixo, valor alinhado à direita, situação em selo colorido
// ("Vencido há 3 dias", "Vence hoje", "Recebido em …") e a ação "Receber" na própria linha. Regras sem DOM.
import { escapeHtml, formatBRL, formatDate } from '../core/money.js';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Situação do lançamento para o selo: key (cor) e texto. */
export function feeSituation(r, t) {
  if (r.status === 'pago') return { key: 'recebido', label: r.paid_at ? `Recebido em ${formatDate(String(r.paid_at).slice(0, 10))}` : 'Recebido' };
  if (r.status === 'cancelado') return { key: 'cancelado', label: 'Cancelado' };
  if (r.status === 'condicional') return { key: 'condicional', label: 'Condicional' };
  if (!r.due_date) return { key: 'semdata', label: 'Sem vencimento' };
  const d = dayDiff(r.due_date, t);
  if (d < 0) return { key: 'vencido', label: `Vencido há ${plural(-d, 'dia', 'dias')}` };
  if (d === 0) return { key: 'hoje', label: 'Vence hoje' };
  return { key: 'avencer', label: d <= 7 ? `Vence em ${plural(d, 'dia', 'dias')}` : 'A vencer' };
}

/** Grupo do mês de vencimento: { key: 'AAAA-MM', label: 'Novembro de 2026' } (sem data vai para o fim). */
export function feeMonth(r) {
  const m = /^(\d{4})-(\d{2})/.exec(String(r.due_date || ''));
  if (!m) return { key: '9999-99', label: 'Sem vencimento' };
  const name = MONTHS[Number(m[2]) - 1];
  return { key: `${m[1]}-${m[2]}`, label: `${name[0].toUpperCase()}${name.slice(1)} de ${m[1]}` };
}

/** Ordem da lista: vencimento mais antigo primeiro; sem vencimento por último. */
export const feeSort = (a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.description || '').localeCompare(String(b.description || ''));

/** Total do grupo: o que falta receber (abertos) e o que já entrou. */
export function groupTotals(rows) {
  const open = rows.filter((r) => r.status === 'aberto').reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const paid = rows.filter((r) => r.status === 'pago').reduce((s, r) => s + (Number(r.paid_amount ?? r.amount) || 0), 0);
  return { open, paid };
}

export function groupHeaderHtml(label, rows) {
  const { open, paid } = groupTotals(rows);
  return `<span class="fin-group-name">${escapeHtml(label)}</span><span class="fin-group-sum">${open ? `a receber <strong>${formatBRL(open)}</strong>` : ''}${open && paid ? ' · ' : ''}${paid ? `recebido <strong>${formatBRL(paid)}</strong>` : ''}</span>`;
}

/** Células próprias da lista (o resto usa o padrão da tela). names: { client, caseNumber, partner } já resolvidos. */
export function feeCell(key, r, t, names = {}) {
  if (key === 'who') {
    const sub = [r.description, names.caseNumber].filter(Boolean).map(escapeHtml).join(' · ');
    return `<div class="fin-who"><strong>${escapeHtml(names.client || 'Sem cliente')}</strong><span>${sub}</span></div>`;
  }
  if (key === 'value') {
    const main = r.amount ? formatBRL(r.amount) : (r.percent ? `${String(r.percent).replace('.', ',')}%` : '—');
    const extra = names.partnerPercent && r.amount ? `<span>repasse ${formatBRL(r.amount * names.partnerPercent / 100)}</span>` : (r.status === 'pago' && r.paid_amount != null && Number(r.paid_amount) !== Number(r.amount) ? `<span>recebido ${formatBRL(r.paid_amount)}</span>` : '');
    return `<div class="fin-value"><strong>${main}</strong>${extra}</div>`;
  }
  if (key === 'situation') {
    const s = feeSituation(r, t);
    return `<span class="fin-pill fin-${s.key}">${escapeHtml(s.label)}</span>${names.method ? `<span class="fin-method">${escapeHtml(names.method)}</span>` : ''}`;
  }
  if (key === 'act') {
    if (r.status === 'aberto') return `<button type="button" class="btn-mini fin-receive" data-receive="${escapeHtml(r.id)}" data-to="1" title="Marcar como recebido hoje">Receber</button>`;
    if (r.status === 'pago') return `<button type="button" class="link fin-undo" data-receive="${escapeHtml(r.id)}" data-to="0" title="Voltar para a receber">desfazer</button>`;
    return '';
  }
  return null;
}

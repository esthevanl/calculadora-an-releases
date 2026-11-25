// Mensagem de cobrança (sem DOM: testável em Node). O app só PREPARA a mensagem e abre o WhatsApp/Gmail
// com ela pronta; o envio é sempre um clique seu (o app nunca manda mensagem sozinho).
import { formatBRL, formatDate } from '../core/money.js';

export const DEFAULT_CHARGE_TEMPLATE = [
  'Olá, {nome}! Tudo bem? 😊',
  '',
  'Passando para lembrar, com carinho, que {parcela} dos honorários, no valor de *{valor}*, vence *{quando}*.',
  '{pagamento}',
  'Se o pagamento já foi feito, por favor desconsidere esta mensagem — e muito obrigado!',
  '',
  'Qualquer dúvida, estamos à disposição.',
  'Equipe Almeida Nascimento'
].join('\n');

const METHOD_LINE = {
  pix: 'O pagamento pode ser feito por PIX.',
  boleto: 'O boleto segue com o mesmo vencimento; se precisar da segunda via, é só pedir.',
  cartao_credito: 'O pagamento é no cartão de crédito, conforme combinado.',
  transferencia: 'O pagamento pode ser feito por transferência, conforme combinado.'
};

const firstName = (name) => {
  const n = String(name || '').trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : '';
};

/** "amanhã (25/12/2026)", "hoje (…)", "em 25/12/2026" ou "em 25/12/2026 (vencida)". */
export function whenText(due, today) {
  if (!due) return 'em breve';
  const d = formatDate(due);
  const diff = Math.round((new Date(`${due}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 864e5);
  if (diff === 0) return `hoje (${d})`;
  if (diff === 1) return `amanhã (${d})`;
  if (diff < 0) return `em ${d}, e ainda consta em aberto`;
  return `em ${d}`;
}

/**
 * Texto da cobrança a partir do lançamento.
 * @param fee { description, amount, due_date, payment_method }
 * @param client { name }
 */
export function chargeMessage(fee, client, { today, template = DEFAULT_CHARGE_TEMPLATE } = {}) {
  const parcela = fee?.description ? `a parcela "${fee.description}"` : 'a parcela';
  const text = String(template || DEFAULT_CHARGE_TEMPLATE)
    .replaceAll('{nome}', firstName(client?.name) || 'tudo bem')
    .replaceAll('{parcela}', parcela)
    .replaceAll('{valor}', fee?.amount ? formatBRL(fee.amount) : 'combinado')
    .replaceAll('{quando}', whenText(fee?.due_date, today))
    .replaceAll('{pagamento}', METHOD_LINE[fee?.payment_method] || '');
  return text.replace(/Olá, tudo bem! Tudo bem\?/, 'Olá! Tudo bem?').replace(/\n{3,}/g, '\n\n').trim();
}

/** Telefone brasileiro só com dígitos e DDI 55 ("(69) 99999-0000" → "5569999990000"). */
export function phoneDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (!d.startsWith('55') || d.length <= 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 13 ? d : '';
}

export const whatsappUrl = (phone, text) => `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
export const gmailUrl = (to, subject, body) => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to || '')}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

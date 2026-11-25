// Tipos de notificação e o que cada pessoa recebe por padrão (cada um muda nas próprias preferências).
// Sem DOM: usado no computador, no celular e — copiado — na função que envia (supabase/functions/notify).
// Canais: "phone" = aviso no celular (push); "desktop" = aviso do Windows no app do computador.

export const NOTIFY_TYPES = [
  { key: 'morning_summary', label: 'Resumo da manhã', help: 'Prazos e tarefas de hoje, atrasadas e publicações não lidas (no horário que você escolher).', who: 'all' },
  { key: 'task_assigned', label: 'Tarefa atribuída a mim', help: 'Quando outra pessoa atribui uma tarefa a você.', who: 'all' },
  { key: 'new_publication', label: 'Publicação nova do DJEN', help: 'Intimação nova num processo do escritório (só o número do processo, sem o teor).', who: 'all' },
  { key: 'charge_day', label: 'Dia de cobrar', help: 'Cobranças que vencem para você hoje (setor Financeiro).', who: 'finance' },
  { key: 'access_request', label: 'Pedido de acesso', help: 'Alguém pediu acesso ao sistema e aguarda aprovação.', who: 'admin' },
  { key: 'security_alert', label: 'Alerta de segurança', help: 'Conta de administração entrando de endereço novo, exclusões em massa.', who: 'admin' }
];
export const DEFAULT_MORNING = '07:30';

const isAdmin = (u) => ['master', 'admin'].includes(u?.role);
const isFinance = (u) => isAdmin(u) || (['padrao', 'visualizador'].includes(u?.role) && (u?.sectors || []).includes('financeiro'));

/** Tipos que fazem sentido para esta pessoa (financeiro e administração só para quem tem acesso). */
export const typesFor = (user) => NOTIFY_TYPES.filter((t) => t.who === 'all' || (t.who === 'finance' && isFinance(user)) || (t.who === 'admin' && isAdmin(user)));

/** O que vem ligado de fábrica. Publicação nova: ligada para administradores e setor Jurídico. */
export function defaultPrefs(user) {
  const juridico = isAdmin(user) || (user?.sectors || []).includes('juridico') || !(user?.sectors || []).length;
  return {
    morning_summary: { phone: true, desktop: false },
    task_assigned: { phone: true, desktop: true },
    new_publication: { phone: juridico, desktop: juridico },
    charge_day: { phone: true, desktop: true },
    access_request: { phone: true, desktop: true },
    security_alert: { phone: true, desktop: true }
  };
}

/** Preferências salvas por cima do padrão; tipos que a pessoa não pode receber ficam desligados. */
export function effectivePrefs(saved, user) {
  const base = defaultPrefs(user); const allowed = new Set(typesFor(user).map((t) => t.key)); const out = {};
  for (const t of NOTIFY_TYPES) {
    const s = saved?.[t.key] || {};
    out[t.key] = allowed.has(t.key) ? { phone: s.phone ?? base[t.key].phone, desktop: s.desktop ?? base[t.key].desktop } : { phone: false, desktop: false };
  }
  return out;
}

/** "22:00"–"07:00" atravessa a meia-noite. Sem início ou fim: nunca em silêncio. */
export function inQuiet(hhmm, start, end) {
  if (!start || !end || start === end) return false;
  return start < end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
}

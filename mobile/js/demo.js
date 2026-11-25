// Modo demonstração: dados FICTÍCIOS em memória, só para conferir as telas no computador de desenvolvimento
// (abre com localhost …/mobile/?demo=1). Nunca fala com o servidor e não existe no site publicado.
const d = (n) => { const x = new Date(Date.now() + n * 864e5); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }; // dia no fuso do aparelho
const ME = { id: 'demo-me', name: 'Pessoa Fictícia', email: 'demo@exemplo.invalid', role: 'master', roleLabel: 'Administrador master', sectors: ['juridico', 'financeiro'], finance: true };
const clients = [
  { id: 'c1', name: 'Cliente Fictício da Silva', phone: '(00) 0000-0001', whatsapp: '00900000001', city: 'Cidade Exemplo', uf: 'RO', status: 'ativo', type: 'PF' },
  { id: 'c2', name: 'Empresa Exemplo LTDA', phone: '(00) 0000-0002', city: 'Cidade Exemplo', uf: 'RO', status: 'ativo', type: 'PJ' }
];
const cases = [
  { id: 'k1', number: '0000001-00.2030.8.22.0001', tribunal: 'TJRO', class_name: 'Procedimento Comum Cível', organ: '1ª Vara Cível Fictícia', client_id: 'c1', status: 'ativo', client_role: 'autor', opposing_party: 'Estado Fictício' },
  { id: 'k2', number: '0000002-00.2030.4.01.4100', tribunal: 'TRF1', class_name: 'Juizado Especial Federal', organ: 'Vara Federal Fictícia', client_id: 'c2', status: 'ativo', client_role: 'autor', opposing_party: 'União' }
];
const tasks = [
  { id: 't1', title: 'Prazo: Intimação — 0000001-00.2030.8.22.0001 · fatal ' + d(3).split('-').reverse().join('/'), kind: 'prazo', priority: 'alta', status: 'pendente', due_date: d(0), case_id: 'k1', client_id: 'c1', sector: 'juridico', assigned_to: 'demo-me', description: 'PRAZO FATAL em 3 dias.' },
  { id: 't2', title: 'Ligar para o cliente sobre documentos', kind: 'tarefa', priority: 'normal', status: 'pendente', due_date: d(-1), client_id: 'c1', sector: 'juridico', assigned_to: 'demo-me' },
  { id: 't3', title: 'Reunião com Empresa Exemplo', kind: 'reuniao', priority: 'normal', status: 'pendente', due_date: d(2), due_time: '14:00', client_id: 'c2', sector: 'comercial', assigned_to: 'outra' },
  { id: 't4', title: 'Cobrança — Cliente Fictício da Silva — Parcela 2/10 — R$ 200,00', kind: 'cobranca', priority: 'normal', status: 'pendente', due_date: d(0), client_id: 'c1', sector: 'financeiro' }
];
const movements = [
  { id: 'm1', source: 'djen', date: d(-1), title: 'Intimação — Decisão', kind: 'Intimação', case_id: 'k1', process_number: cases[0].number, tribunal: 'TJRO', organ: cases[0].organ, read_at: null, link: 'https://exemplo.invalid',
    text: 'Poder Judiciário Tribunal Fictício Processo 0000001-00.2030.8.22.0001 DECISÃO Vistos. Intime-se a parte autora para, no prazo de 15 dias, manifestar-se sobre a contestação, sob pena de preclusão. Cumpra-se.' },
  { id: 'm2', source: 'datajud', date: d(-3), title: 'Conclusos para decisão', case_id: 'k1', read_at: null, organ: cases[0].organ },
  { id: 'm3', source: 'djen', date: d(-2), title: 'Intimação — Despacho', kind: 'Intimação', case_id: 'k2', process_number: cases[1].number, tribunal: 'TRF1', read_at: null, text: 'DESPACHO Cite-se a União. Prazo de 30 dias.' }
];
const fees = [
  { id: 'f1', description: 'Pro labore — parcela 2/10', kind: 'parcela', status: 'aberto', amount: 200, due_date: d(1), client_id: 'c1', task_id: 't4', payment_method: 'pix' },
  { id: 'f2', description: 'Honorários fixos', kind: 'fixo', status: 'aberto', amount: 1500, due_date: d(-5), client_id: 'c2' }
];
let demoPrefs = null;
const feed = [
  { id: 3, type: 'task_assigned', title: 'Tarefa atribuída a você', body: 'Ligar para o cliente sobre documentos', url: '#/tarefa/t2', created_at: new Date().toISOString(), read_at: null },
  { id: 2, type: 'new_publication', title: 'Publicação nova', body: '0000001-00.2030.8.22.0001 · TJRO', url: '#/publicacao/m1', created_at: new Date(Date.now() - 3600e3).toISOString(), read_at: null },
  { id: 1, type: 'morning_summary', title: 'Bom dia! Seu dia no escritório', body: '2 para hoje · 1 atrasada · 2 publicação(ões) não lida(s)', url: '#/hoje', created_at: new Date(Date.now() - 5 * 3600e3).toISOString(), read_at: new Date().toISOString() }
];
const wait = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));

export function createDemoData() {
  return {
    me: () => wait(ME), touch: () => wait(null),
    directory: () => wait([{ id: 'demo-me', name: ME.name }, { id: 'outra', name: 'Colega Fictícia' }]),
    tasks: () => wait(tasks), task: (id) => wait(tasks.find((t) => t.id === id) || null),
    setTaskStatus: (id, status) => { const t = tasks.find((x) => x.id === id); if (t.assigned_to && t.assigned_to !== ME.id && ME.role !== 'master') return Promise.reject(new Error('O servidor não deixou alterar.')); Object.assign(t, { status }); return wait(t); },
    createTask: (t) => { const n = { id: `t${tasks.length + 1}`, status: 'pendente', priority: 'normal', kind: 'tarefa', ...t }; tasks.push(n); return wait(n); },
    cases: () => wait(cases), caseById: (id) => wait(cases.find((c) => c.id === id) || null), caseTerms: () => wait({ fee_terms: '30% do proveito econômico (fictício).' }),
    movements: (caseId) => wait(movements.filter((m) => m.case_id === caseId).sort((a, b) => b.date.localeCompare(a.date))),
    movement: (id) => wait(movements.find((m) => m.id === id) || null),
    unread: () => wait(movements.filter((m) => m.source === 'djen' && !m.read_at)),
    recentPublications: () => wait(movements.filter((m) => m.source === 'djen')),
    markRead: (id, read = true) => { const m = movements.find((x) => x.id === id); m.read_at = read ? new Date().toISOString() : null; return wait(m); },
    clients: () => wait(clients), client: (id) => wait(clients.find((c) => c.id === id) || null),
    caseTasks: (caseId) => wait(tasks.filter((t) => t.case_id === caseId)),
    clientCases: (clientId) => wait(cases.filter((c) => c.client_id === clientId)),
    fees: () => wait(fees.filter((f) => f.status === 'aberto')), fee: (id) => wait(fees.find((f) => f.id === id) || null),
    prefs: () => wait(demoPrefs), savePrefs: (p) => { demoPrefs = { ...demoPrefs, ...p }; return wait(null); },
    saveSubscription: () => wait(null), deleteSubscription: () => wait(null),
    feed: () => wait(feed), feedUnread: () => wait(feed.filter((f) => !f.read_at).length),
    markFeedRead: (ids) => { feed.forEach((f) => { if (ids.includes(f.id)) f.read_at = new Date().toISOString(); }); return wait(null); },
    payFee: (fee) => { const f = fees.find((x) => x.id === fee.id); f.status = 'pago'; const t = tasks.find((x) => x.id === f.task_id); if (t) t.status = 'concluida'; return wait(f); }
  };
}
export const DEMO_USER = ME;

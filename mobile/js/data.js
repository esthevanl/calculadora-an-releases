// Dados do escritório no celular, direto do servidor (sem cópia local nesta primeira versão: precisa de internet).
// O servidor decide o que cada nível vê (RLS); aqui só se escolhe o que buscar e se esconde o que a pessoa não usa.

const OPEN = 'deleted_at=is.null';
export const canFinance = (u) => ['master', 'admin'].includes(u?.role) || (['padrao', 'visualizador'].includes(u?.role) && (u?.sectors || []).includes('financeiro'));
export const canWrite = (u) => ['master', 'admin', 'padrao'].includes(u?.role);
export const isAdmin = (u) => ['master', 'admin'].includes(u?.role);
const ROLE_LABEL = { master: 'Administrador master', admin: 'Administrador', padrao: 'Acesso padrão', visualizador: 'Visualizador', patrimonial: 'Patrimonial' };
const enc = encodeURIComponent;
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

export function createData(cloud) {
  const get = (path) => cloud.rest('GET', path);
  const patch = async (table, id, body) => {
    const rows = await cloud.rest('PATCH', `${table}?id=eq.${enc(id)}`, { body, prefer: 'return=representation' });
    if (!rows?.length) throw new Error('O servidor não deixou alterar (tarefa atribuída a outra pessoa ou acesso sem permissão).');
    return rows[0];
  };
  // "Lida" é de cada pessoa (tabela movement_reads; sem ela no servidor, vale a marcação antiga, geral).
  const myReads = async () => { try { return new Map((await get('movement_reads?select=movement_id,read_at&deleted_at=is.null&limit=10000')).map((r) => [r.movement_id, r.read_at])); } catch { return null; } };
  const withReads = async (rows) => { const reads = await myReads(); return reads ? (rows || []).map((m) => (m && reads.has(m.id) ? { ...m, read_at: reads.get(m.id) } : m)) : rows; };
  return {
    async me() {
      const uid = cloud.session?.user?.id;
      const rows = await get(`profiles?id=eq.${enc(uid)}&select=*`);
      const p = rows?.[0];
      if (!p) return null;
      const u = { id: p.id, name: p.name || p.email, email: p.email, role: p.role, roleLabel: ROLE_LABEL[p.role] || p.role, status: p.status, sectors: p.sectors || [], must_change: Boolean(p.must_change) };
      return { ...u, finance: canFinance(u) };
    },
    touch() { return cloud.rpc('touch_profile').catch(() => null); },
    directory: () => get('profiles?select=id,name,role,sectors&status=eq.ativo&role=neq.patrimonial&order=name.asc'),
    // Tarefas em aberto e as concluídas nos últimos 7 dias.
    tasks: () => get(`tasks?${OPEN}&or=(status.neq.concluida,completed_at.gte.${enc(new Date(Date.now() - 7 * 864e5).toISOString())})&select=*&order=due_date.asc.nullslast,due_time.asc.nullslast&limit=800`),
    task: async (id) => (await get(`tasks?id=eq.${enc(id)}&select=*`))?.[0] || null,
    setTaskStatus: (id, status) => patch('tasks', id, { status, completed_at: status === 'concluida' ? new Date().toISOString() : null }),
    async createTask(t) {
      const now = new Date().toISOString();
      const rows = await cloud.rest('POST', 'tasks', { body: [{ id: uuid(), status: 'pendente', priority: 'normal', kind: 'tarefa', rev: 1, created_at: now, ...t }], prefer: 'return=representation' });
      return rows?.[0];
    },
    cases: () => get(`cases?${OPEN}&select=id,number,tribunal,class_name,organ,client_id,status,client_role,opposing_party,subject&order=updated_at.desc&limit=1000`),
    caseById: async (id) => (await get(`cases?id=eq.${enc(id)}&select=*`))?.[0] || null,
    caseTerms: async (id) => (await get(`case_terms?id=eq.${enc(id)}&select=fee_terms`).catch(() => []))?.[0] || null,
    movements: async (caseId) => withReads(await get(`movements?case_id=eq.${enc(caseId)}&${OPEN}&select=id,date,title,kind,source,read_at,link,organ&order=date.desc&limit=80`)),
    movement: async (id) => (await withReads(await get(`movements?id=eq.${enc(id)}&select=*`)))?.[0] || null,
    unread: async () => (await withReads(await get(`movements?source=eq.djen&read_at=is.null&${OPEN}&select=id,date,title,kind,process_number,tribunal,organ,case_id,link,read_at&order=date.desc&limit=200`))).filter((m) => !m.read_at),
    recentPublications: async () => withReads(await get(`movements?source=eq.djen&${OPEN}&select=id,date,title,kind,process_number,tribunal,organ,case_id,link,read_at&order=date.desc&limit=60`)),
    async markRead(id, read = true) {
      const uid = cloud.session?.user?.id; const at = read ? new Date().toISOString() : null;
      try { await cloud.rest('POST', 'movement_reads?on_conflict=id', { body: [{ id: `${uid}:${id}`, user_id: uid, movement_id: id, read_at: at }], prefer: 'resolution=merge-duplicates,return=minimal' }); return { id, read_at: at }; }
      catch (error) { if (error.status === 404 || /movement_reads/.test(String(error.message))) return patch('movements', id, { read_at: at }); throw error; }
    },
    clients: () => get(`clients?${OPEN}&select=id,name,phone,whatsapp,email,city,uf,document,status,type&order=name.asc&limit=2000`),
    client: async (id) => (await get(`clients?id=eq.${enc(id)}&select=*`))?.[0] || null,
    caseTasks: (caseId) => get(`tasks?case_id=eq.${enc(caseId)}&${OPEN}&select=*&order=due_date.asc.nullslast&limit=100`),
    clientCases: (clientId) => get(`cases?client_id=eq.${enc(clientId)}&${OPEN}&select=id,number,class_name,tribunal,status&order=updated_at.desc`),
    // Notificações: preferências, aparelhos e caixa — cada pessoa só vê e muda as próprias (regras no servidor).
    prefs: async () => (await get(`notification_prefs?user_id=eq.${enc(cloud.session?.user?.id)}&select=*`))?.[0] || null,
    savePrefs: (p) => cloud.rest('POST', 'notification_prefs?on_conflict=user_id', { body: [{ user_id: cloud.session?.user?.id, ...p, updated_at: new Date().toISOString() }], prefer: 'resolution=merge-duplicates,return=minimal' }),
    saveSubscription: (s) => cloud.rest('POST', 'push_subscriptions?on_conflict=endpoint', { body: [{ user_id: cloud.session?.user?.id, ...s }], prefer: 'resolution=ignore-duplicates,return=minimal' }),
    deleteSubscription: (endpoint) => cloud.rest('DELETE', `push_subscriptions?endpoint=eq.${enc(endpoint)}`),
    feed: () => get('notification_feed?select=id,type,title,body,url,created_at,read_at&order=id.desc&limit=60'),
    feedUnread: async () => (await get('notification_feed?select=id&read_at=is.null&limit=99')).length,
    markFeedRead: (ids) => cloud.rest('PATCH', `notification_feed?id=in.(${ids.map(Number).join(',')})`, { body: { read_at: new Date().toISOString() } }),
    // Financeiro (o servidor só entrega para quem pode ver).
    fees: () => get(`fees?${OPEN}&status=in.(aberto,condicional)&select=*&order=due_date.asc.nullslast&limit=1000`),
    fee: async (id) => (await get(`fees?id=eq.${enc(id)}&select=*`))?.[0] || null,
    async payFee(fee) {
      const today = new Date().toISOString().slice(0, 10);
      const saved = await patch('fees', fee.id, { status: 'pago', paid_at: fee.paid_at || today, paid_amount: fee.paid_amount ?? fee.amount ?? null });
      // Recebido: a tarefa de cobrança ligada a ele também se conclui (como no computador).
      if (fee.task_id) await patch('tasks', fee.task_id, { status: 'concluida', completed_at: new Date().toISOString() }).catch(() => null);
      return saved;
    }
  };
}

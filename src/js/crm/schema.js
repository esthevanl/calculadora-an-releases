// Definição dos cadastros do escritório: campos do formulário e colunas da lista.
// Para incluir um campo: acrescente aqui E na whitelist/migração de electron/db.cjs.
import { feeSort, feeMonth, groupHeaderHtml, feeCell } from '../finance/fee-list.js';

const UF = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const plusDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();
// Filtros da lista: [valor, rótulo, (registro, hoje) => boolean]. O primeiro é o padrão.
const TASK_FILTERS = [
  ['abertas', 'Em aberto', (r) => r.status !== 'concluida'],
  ['minhas', 'Atribuídas a mim', (r, t, c) => r.status !== 'concluida' && Boolean(c?.me) && r.assigned_to === c.me],
  ['atrasadas', 'Atrasadas', (r, t) => r.status !== 'concluida' && r.due_date && r.due_date < t],
  ['hoje', 'Hoje', (r, t) => r.status !== 'concluida' && r.due_date === t],
  ['semana', 'Próximos 7 dias', (r, t) => r.status !== 'concluida' && r.due_date && r.due_date >= t && r.due_date <= plusDays(7)],
  ['concluidas', 'Concluídas', (r) => r.status === 'concluida'],
  ['cobrancas', 'Cobranças (todas, inclusive futuras)', (r) => r.kind === 'cobranca' && r.status !== 'concluida'],
  ['todos', 'Todas', () => true]
];
// Cobrança só aparece em Tarefas, Quadro e Painel a partir do dia dela (antes, fica no filtro "Cobranças").
export const isFutureCharge = (r, t) => r.kind === 'cobranca' && r.status !== 'concluida' && Boolean(r.due_date) && r.due_date > t;
export const PAYMENT_METHODS = [['boleto', 'Boleto bancário'], ['cartao_credito', 'Cartão de crédito'], ['cartao_debito', 'Cartão de débito'], ['pix', 'PIX'], ['transferencia', 'Transferência / TED'], ['dinheiro', 'Dinheiro'], ['cheque', 'Cheque'], ['alvara', 'Alvará / RPV (destaque)']];
const FEE_FILTERS = [
  ['todos', 'Todos', () => true],
  ['abertos', 'A receber', (r) => r.status === 'aberto'],
  ['atrasados', 'Atrasados', (r, t) => r.status === 'aberto' && r.due_date && r.due_date < t],
  ['mes', 'Vencem este mês', (r, t) => r.status === 'aberto' && r.due_date?.slice(0, 7) === t.slice(0, 7)],
  ['condicionais', 'Condicionais / êxito', (r) => r.status === 'condicional'],
  ['pagos', 'Recebidos', (r) => r.status === 'pago']
];

export const SCHEMAS = {
  clients: {
    title: 'Clientes', singular: 'cliente', search: ['name', 'document', 'email', 'phone', 'city'],
    columns: [['name', 'Nome'], ['document', 'CPF/CNPJ'], ['phone', 'Telefone'], ['city', 'Cidade'], ['status', 'Situação']],
    fields: [
      { key: 'type', label: 'Tipo', type: 'select', options: [['PF', 'Pessoa física'], ['PJ', 'Pessoa jurídica']] },
      { key: 'name', label: 'Nome / razão social', required: true, wide: true },
      { key: 'document', label: 'CPF / CNPJ', action: 'cnpj' },
      { key: 'status', label: 'Situação', type: 'select', options: [['lead', 'Prospecção'], ['proposta', 'Proposta enviada'], ['ativo', 'Cliente ativo'], ['inativo', 'Inativo']] },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'phone', label: 'Telefone' },
      { key: 'whatsapp', label: 'WhatsApp', action: 'whatsapp' },
      { key: 'origin', label: 'Origem (indicação, site…)' },
      { key: 'nationality', label: 'Nacionalidade (PF)', placeholder: 'brasileiro(a)' },
      { key: 'marital_status', label: 'Estado civil (PF)', placeholder: 'casado(a), solteiro(a)…' },
      { key: 'profession', label: 'Profissão (PF)' },
      { key: 'rg', label: 'RG e órgão emissor (PF)' },
      { key: 'representative', label: 'Representante legal (PJ): nome, qualificação e CPF', wide: true },
      { key: 'cep', label: 'CEP', action: 'cep' },
      { key: 'street', label: 'Logradouro', wide: true },
      { key: 'number', label: 'Número' },
      { key: 'complement', label: 'Complemento' },
      { key: 'district', label: 'Bairro' },
      { key: 'city', label: 'Cidade' },
      { key: 'uf', label: 'UF', type: 'select', options: UF.map((u) => [u, u]) },
      { key: 'folder_path', label: 'Pasta de documentos (caminho)', wide: true, action: 'folder' },
      { key: 'notes', label: 'Observações', type: 'textarea', wide: true }
    ],
    filters: [['todos', 'Todos', () => true], ['ativo', 'Ativos', (r) => r.status === 'ativo'], ['lead', 'Prospecção', (r) => r.status === 'lead'], ['proposta', 'Proposta enviada', (r) => r.status === 'proposta'], ['inativo', 'Inativos', (r) => r.status === 'inativo']],
    related: [['cases', 'client_id', 'Processos'], ['tasks', 'client_id', 'Tarefas e prazos'], ['fees', 'client_id', 'Financeiro'], ['calculations', 'client_id', 'Cálculos']]
  },
  cases: {
    title: 'Processos', singular: 'processo', search: ['number', 'class_name', 'organ', 'opposing_party', 'subject'],
    columns: [['number', 'Número'], ['client_id', 'Cliente'], ['class_name', 'Classe'], ['tribunal', 'Tribunal'], ['status', 'Situação']],
    fields: [
      { key: 'number', label: 'Número (CNJ)', placeholder: '0000000-00.0000.0.00.0000', required: true, wide: true, action: 'process' },
      { key: 'tribunal', label: 'Tribunal (sai do número)', placeholder: 'TJRO, TRF1, TRT14…' },
      { key: 'client_id', label: 'Cliente', type: 'ref', ref: 'clients' },
      { key: 'client_role', label: 'Posição do cliente', type: 'select', options: [['autor', 'Autor / requerente'], ['reu', 'Réu / requerido'], ['terceiro', 'Terceiro']] },
      { key: 'organ', label: 'Vara / órgão julgador', wide: true },
      { key: 'class_name', label: 'Classe' },
      { key: 'subject', label: 'Assunto / tese' },
      { key: 'opposing_party', label: 'Parte contrária', wide: true },
      { key: 'partner_id', label: 'Parceria', type: 'ref', ref: 'partners' },
      { key: 'value', label: 'Valor da causa (R$)', type: 'number' },
      { key: 'started_at', label: 'Distribuição', type: 'date' },
      { key: 'status', label: 'Situação', type: 'select', options: [['ativo', 'Ativo'], ['suspenso', 'Suspenso'], ['arquivado', 'Arquivado'], ['encerrado', 'Encerrado']] },
      { key: 'parties', label: 'Partes (dados públicos: DJEN/DataJud)', type: 'textarea', wide: true },
      { key: 'notes', label: 'Observações', type: 'textarea', wide: true }
    ],
    related: [['tasks', 'case_id', 'Tarefas e prazos'], ['fees', 'case_id', 'Financeiro'], ['calculations', 'case_id', 'Cálculos'], ['movements', 'case_id', 'Andamentos']]
  },
  tasks: {
    title: 'Tarefas e prazos', singular: 'tarefa', newLabel: 'Nova tarefa', search: ['title', 'description', 'responsible'],
    columns: [['due_date', 'Prazo'], ['title', 'Tarefa'], ['kind', 'Tipo'], ['assigned_to', 'Responsável'], ['case_id', 'Processo'], ['priority', 'Prioridade'], ['status', 'Situação']],
    fields: [
      { key: 'title', label: 'Título', required: true, wide: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: [['prazo', 'Prazo processual'], ['audiencia', 'Audiência'], ['reuniao', 'Reunião'], ['tarefa', 'Tarefa'], ['cobranca', 'Cobrança / vencimento'], ['demanda', 'Demanda interna']] },
      { key: 'priority', label: 'Prioridade', type: 'select', options: [['alta', 'Alta'], ['normal', 'Normal'], ['baixa', 'Baixa']] },
      { key: 'due_date', label: 'Data', type: 'date' },
      { key: 'due_time', label: 'Hora', type: 'time' },
      { key: 'client_id', label: 'Cliente', type: 'ref', ref: 'clients' },
      { key: 'case_id', label: 'Processo', type: 'ref', ref: 'cases' },
      { key: 'assigned_to', label: 'Atribuída a', type: 'user' },
      { key: 'sector', label: 'Setor', type: 'select', options: [['juridico', 'Jurídico'], ['financeiro', 'Financeiro'], ['comercial', 'Comercial'], ['administrativo', 'Administrativo']] },
      { key: 'status', label: 'Situação', type: 'select', options: [['pendente', 'A fazer'], ['andamento', 'Em andamento'], ['aguardando', 'Aguardando (cliente/terceiro)'], ['concluida', 'Concluída']] },
      { key: 'description', label: 'Descrição', type: 'textarea', wide: true }
    ],
    filters: TASK_FILTERS,
    hide: isFutureCharge, showHiddenIn: ['cobrancas'],
    toggle: { key: 'title', label: 'Concluir', isDone: (r) => r.status === 'concluida', patch: (done) => ({ status: done ? 'concluida' : 'pendente', completed_at: done ? nowIso() : null }) },
    isLate: (r, t) => r.status !== 'concluida' && r.due_date && r.due_date < t
  },
  fees: {
    title: 'Financeiro', singular: 'lançamento', newLabel: 'Novo lançamento', search: ['description', 'notes', 'contract_name'],
    // Lista no padrão "contas a receber": agrupada por mês, cliente em destaque, selo de situação e botão Receber.
    columns: [['due_date', 'Vencimento'], ['who', 'Cliente e descrição'], ['value', 'Valor'], ['situation', 'Situação'], ['act', '']],
    sort: feeSort,
    group: feeMonth,
    groupHeader: groupHeaderHtml,
    listCell: (key, r, t, v) => feeCell(key, r, t, { client: v.refName('clients', r.client_id), caseNumber: v.refName('cases', r.case_id), partnerPercent: v.refs.partners?.find((p) => p.id === r.partner_id)?.fee_percent, method: r.payment_method ? optionLabel(SCHEMAS.fees, 'payment_method', r.payment_method) : '' }),
    fields: [
      { key: 'description', label: 'Descrição', required: true, wide: true },
      { key: 'kind', label: 'Tipo', type: 'select', options: [['consulta', 'Consulta'], ['fixo', 'Honorários fixos'], ['entrada', 'Entrada'], ['parcela', 'Parcela'], ['mensal', 'Mensalidade'], ['recursal', 'Pro labore recursal'], ['exito', 'Êxito'], ['sucumbencia', 'Sucumbência'], ['despesa', 'Despesa / reembolso']] },
      { key: 'status', label: 'Situação', type: 'select', options: [['aberto', 'A receber'], ['pago', 'Recebido'], ['condicional', 'Condicional (depende de evento)'], ['cancelado', 'Cancelado']] },
      { key: 'payment_method', label: 'Forma de pagamento', type: 'select', options: PAYMENT_METHODS },
      { key: 'amount', label: 'Valor (R$)', type: 'number' },
      { key: 'percent', label: '% (êxito)', type: 'number' },
      { key: 'due_date', label: 'Vencimento', type: 'date' },
      { key: 'paid_at', label: 'Recebido em', type: 'date' },
      { key: 'paid_amount', label: 'Valor recebido (R$)', type: 'number' },
      { key: 'client_id', label: 'Cliente', type: 'ref', ref: 'clients' },
      { key: 'case_id', label: 'Processo', type: 'ref', ref: 'cases' },
      { key: 'partner_id', label: 'Parceria (repasse)', type: 'ref', ref: 'partners' },
      { key: 'contract_name', label: 'Contrato de origem' },
      { key: 'assigned_to', label: 'Responsável pela cobrança', type: 'user' },
      { key: 'notes', label: 'Observações', type: 'textarea', wide: true }
    ],
    filters: FEE_FILTERS,
    // Ações em lote (checkbox na lista): tratadas em src/js/finance/ui.js.
    bulk: [['paid', 'Marcar recebido'], ['method', 'Forma de pagamento'], ['due', 'Alterar vencimento'], ['tasks', 'Criar tarefas de cobrança'], ['delete', 'Excluir', true]],
    toggle: { key: 'description', label: 'Marcar como recebido', isDone: (r) => r.status === 'pago', patch: (done, r) => ({ status: done ? 'pago' : 'aberto', paid_at: done ? (r.paid_at || nowIso().slice(0, 10)) : null, paid_amount: done ? (r.paid_amount ?? r.amount) : null }) },
    isLate: (r, t) => r.status === 'aberto' && r.due_date && r.due_date < t
  },
  partners: {
    title: 'Parcerias', singular: 'parceiro', search: ['name', 'document', 'oab', 'email'],
    columns: [['name', 'Parceiro'], ['oab', 'OAB'], ['phone', 'Telefone'], ['fee_percent', '% honorários']],
    fields: [
      { key: 'name', label: 'Nome / escritório', required: true, wide: true },
      { key: 'document', label: 'CPF / CNPJ', action: 'cnpj' },
      { key: 'oab', label: 'OAB' },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'phone', label: 'Telefone' },
      { key: 'fee_percent', label: '% dos honorários do parceiro', type: 'number', finance: true },
      { key: 'notes', label: 'Condições da parceria', type: 'textarea', wide: true }
    ],
    related: [['cases', 'partner_id', 'Processos da parceria']]
  }
};

/** Rótulo de um valor de campo select. */
export function optionLabel(schema, key, value) {
  const field = schema.fields.find((f) => f.key === key);
  return field?.options?.find(([v]) => v === value)?.[1] ?? value ?? '';
}

// AN Software no celular: tarefas e prazos, processos (com as publicações para ler), publicações, clientes e financeiro.
// Fala direto com o servidor do escritório; as regras de quem vê o quê ficam no servidor (RLS), iguais ao computador.
import { cloud, token } from './supabase.js';
import { createData, canWrite, isAdmin } from './data.js';
import { createDemoData, DEMO_USER } from './demo.js';
import { createRealtime } from './realtime.js';
import { SUPABASE_URL, SUPABASE_KEY, APP_VERSION, REMEMBER_DAYS } from './config.js';
import { escapeHtml as esc, formatBRL, formatDate, stripAccents, titleCase, teorParts, paragraphHtml, chargeMessage, whatsappUrl, phoneDigits, DEFAULT_CHARGE_TEMPLATE, isFutureCharge, googleCalendarUrl } from './shared.js';
import { screenNotifications, enablePush, disablePush, sendTest, prefsFromForm } from './notify-ui.js';

const DEMO = new URLSearchParams(location.search).has('demo') && ['localhost', '127.0.0.1'].includes(location.hostname);
const app = document.getElementById('app');
const state = { user: null, data: null, directory: [], live: false, cache: {}, filters: {} };
const clean = (e) => String(e?.message || e || '');
/** Data de hoje no fuso do aparelho (o toISOString puro vira o dia seguinte à noite). */
const localDay = (offset = 0) => { const d = new Date(Date.now() + offset * 864e5); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const norm = (v) => stripAccents(String(v ?? '')).toLowerCase();
const KIND = { prazo: 'Prazo processual', audiencia: 'Audiência', reuniao: 'Reunião', tarefa: 'Tarefa', cobranca: 'Cobrança', demanda: 'Demanda interna' };
const SECTORS = [['juridico', 'Jurídico'], ['financeiro', 'Financeiro'], ['comercial', 'Comercial'], ['administrativo', 'Administrativo']];
const sectorLabel = (v) => SECTORS.find(([k]) => k === v)?.[1] || '';
const STATUS = { pendente: 'A fazer', andamento: 'Em andamento', aguardando: 'Aguardando', concluida: 'Concluída' };
const ROLE = { autor: 'Autor / requerente', reu: 'Réu / requerido', terceiro: 'Terceiro' };
const ICON = {
  hoje: '<path d="M4 5h16v16H4zM4 9h16M8 3v4M16 3v4"/><path d="M9 14l2 2 4-4"/>',
  tarefas: '<path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
  processos: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7"/>',
  publicacoes: '<path d="M4 4h12v16H6a2 2 0 0 1-2-2zM16 8h4v10a2 2 0 0 1-2 2M8 8h4M8 12h4"/>',
  mais: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'
};

// ---------------------------------------------------------------- utilidades
function toast(text) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 3200);
}
/** Número de publicações não lidas na aba (atualiza sem redesenhar a tela). */
function setUnread(n) {
  state.unreadCount = n;
  const tab = app.querySelector('nav.tabs a[href="#/publicacoes"]'); if (!tab) return;
  let b = tab.querySelector('.badge'); if (!n) { b?.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'badge'; tab.appendChild(b); }
  b.textContent = String(n);
}
/** Número de notificações novas no sino (atualiza sem redesenhar). */
async function refreshBell() {
  try { state.feedUnread = await state.data.feedUnread(); } catch { return; }
  const bell = app.querySelector('.bell'); if (!bell) return;
  let b = bell.querySelector('.badge'); if (!state.feedUnread) { b?.remove(); return; }
  if (!b) { b = document.createElement('span'); b.className = 'badge'; bell.appendChild(b); }
  b.textContent = String(state.feedUnread);
}
const userName = (id) => state.directory.find((u) => u.id === id)?.name || '';
const canEditTask = (t) => canWrite(state.user) && (isAdmin(state.user) || !t.assigned_to || t.assigned_to === state.user.id || t.created_by === state.user.id);
async function cached(key, fn, fresh = false) { if (!fresh && state.cache[key]) return state.cache[key]; state.cache[key] = await fn(); return state.cache[key]; }
const clientsMap = async () => new Map((await cached('clients', () => state.data.clients())).map((c) => [c.id, c]));
const casesMap = async () => new Map((await cached('cases', () => state.data.cases())).map((c) => [c.id, c]));

// ---------------------------------------------------------------- entrada
function renderLogin(notice = '') {
  let saved = ''; try { saved = localStorage.getItem('an.mobile.email') || ''; } catch { /* sem armazenamento */ }
  app.innerHTML = `<div class="login"><form novalidate data-form="login">
    <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><h1>AN Software</h1>
    ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}
    <input type="email" name="email" placeholder="E-mail" autocomplete="username" autocapitalize="off" value="${esc(saved)}" aria-label="E-mail">
    <input type="password" name="pw" placeholder="Senha" autocomplete="current-password" aria-label="Senha">
    <label class="check"><input type="checkbox" name="remember"> Lembrar de mim neste celular</label>
    <button class="btn primary" type="submit">Entrar</button>
    <p class="msg" data-msg role="alert"></p>
    <div class="links"><button type="button" class="link" data-act="signup">Primeiro acesso? Pedir acesso</button>
    <button type="button" class="link" data-act="forgot">Esqueci a senha</button></div></form></div>`;
}
function renderSignup() {
  app.innerHTML = `<div class="login"><form novalidate data-form="signup">
    <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><h1>Pedir acesso</h1>
    <p class="notice">O acesso fica aguardando aprovação de um administrador do escritório.</p>
    <input type="text" name="name" placeholder="Seu nome" autocomplete="name" aria-label="Seu nome">
    <input type="email" name="email" placeholder="Seu e-mail" autocomplete="username" autocapitalize="off" aria-label="Seu e-mail">
    <input type="password" name="pw" placeholder="Crie uma senha (mín. 8)" autocomplete="new-password" aria-label="Senha">
    <input type="password" name="pw2" placeholder="Repita a senha" autocomplete="new-password" aria-label="Repita a senha">
    <button class="btn primary" type="submit">Pedir acesso</button>
    <p class="msg" data-msg role="alert"></p>
    <div class="links"><button type="button" class="link" data-act="login">Já tenho acesso: entrar</button></div></form></div>`;
}
function renderChangePassword() {
  app.innerHTML = `<div class="login"><form novalidate data-form="change">
    <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><h1>Crie a sua senha</h1>
    <p class="notice">Sua senha foi definida por um administrador. Crie a sua para continuar.</p>
    <input type="password" name="pw" placeholder="Nova senha (mín. 8)" autocomplete="new-password" aria-label="Nova senha">
    <input type="password" name="pw2" placeholder="Repita a nova senha" autocomplete="new-password" aria-label="Repita a nova senha">
    <button class="btn primary" type="submit">Salvar e entrar</button><p class="msg" data-msg role="alert"></p></form></div>`;
}

async function afterLogin() {
  state.data = createData(cloud);
  const user = await state.data.me();
  if (!user) { await cloud.signOut(); return renderLogin('Não encontrei o seu perfil no servidor. Fale com o administrador master.'); }
  if (user.status !== 'ativo') { await cloud.signOut(); return renderLogin(user.status === 'pendente' ? 'Seu pedido de acesso ainda não foi aprovado. Avise um administrador do escritório.' : 'Este acesso está desativado.'); }
  if (cloud.rememberExpired(user.role)) { await cloud.signOut(); return renderLogin(`Por segurança, a cada ${REMEMBER_DAYS} dias o app pede a senha de novo.`); }
  state.user = user;
  if (user.must_change) return renderChangePassword();
  return startShell();
}

async function startShell() {
  if (state.user.role === 'patrimonial') {
    app.innerHTML = `<div class="login"><form><span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><h1>AN Software</h1>
      <p class="notice">Seu acesso é ao módulo de Análise Patrimonial, que fica no app do computador.</p><button type="button" class="btn" data-act="logout">Sair</button></form></div>`;
    return;
  }
  if (!DEMO) state.data.touch();
  try { state.directory = await state.data.directory(); } catch { state.directory = []; }
  startRealtime();
  await route();
  refreshBell();
}

// ---------------------------------------------------------------- tempo real
let realtime = null; let rerenderTimer = null;
function startRealtime() {
  if (DEMO || realtime) return;
  realtime = createRealtime({
    url: SUPABASE_URL, key: SUPABASE_KEY, getToken: () => token(),
    onChange: (table) => { delete state.cache[table]; if (table === 'notification_feed') { refreshBell(); return; } clearTimeout(rerenderTimer); rerenderTimer = setTimeout(() => { if (!document.querySelector('form.sheet')) route(true); }, 800); },
    onState: (live) => { state.live = live; const dot = document.querySelector('.status-dot'); if (dot) { dot.className = `status-dot ${live ? 'live' : 'off'}`; dot.title = live ? 'Ao vivo' : 'Sem tempo real'; } }
  });
  realtime.start();
  cloud.onSession((s) => realtime?.token(s?.access_token));
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) { state.cache = {}; route(true); } });

// ---------------------------------------------------------------- moldura e rotas
const TABS = [['hoje', 'Hoje'], ['tarefas', 'Tarefas'], ['processos', 'Processos'], ['publicacoes', 'Publicações'], ['mais', 'Mais']];
function frame(title, { tab = '', back = null, fab = null } = {}) {
  app.innerHTML = `<header class="top">${back ? `<button type="button" class="back" data-go="${back}" aria-label="Voltar">‹</button>` : ''}<h1>${esc(title)}</h1><a class="icon bell" href="#/notificacoes" aria-label="Notificações">🔔${state.feedUnread ? `<span class="badge">${state.feedUnread}</span>` : ''}</a><span class="status-dot ${state.live || DEMO ? 'live' : 'off'}" title="${state.live ? 'Ao vivo' : 'Conectando'}"></span></header>
    <main class="content" data-main><div class="loading">Carregando…</div></main>
    ${fab ? `<button type="button" class="fab" data-go="${fab}" aria-label="Nova tarefa">+</button>` : ''}
    <nav class="tabs" aria-label="Menu">${TABS.map(([k, l]) => `<a href="#/${k}" class="${k === tab ? 'active' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>${l}${k === 'publicacoes' && state.unreadCount ? `<span class="badge">${state.unreadCount}</span>` : ''}</a>`).join('')}</nav>`;
  return app.querySelector('[data-main]');
}

const ROUTES = [
  [/^#\/(hoje)?$/, screenHoje], [/^#\/tarefas$/, screenTasks], [/^#\/tarefa\/([^/]+)$/, screenTask], [/^#\/nova-tarefa(?:\/([^/]+))?$/, screenNewTask],
  [/^#\/processos$/, screenCases], [/^#\/processo\/([^/]+)$/, screenCase], [/^#\/publicacoes$/, screenPubs], [/^#\/publicacao\/([^/]+)$/, screenPub],
  [/^#\/clientes$/, screenClients], [/^#\/cliente\/([^/]+)$/, screenClient], [/^#\/financeiro$/, screenFees], [/^#\/lancamento\/([^/]+)$/, screenFee], [/^#\/mais$/, screenMore], [/^#\/notificacoes$/, () => screenNotifications({ frame, data: state.data, user: state.user, demo: DEMO })]
];
async function route(soft = false) {
  if (!state.user) return;
  const hash = location.hash || '#/hoje';
  const hit = ROUTES.find(([re]) => re.test(hash)) || ROUTES[0];
  const arg = hash.match(hit[0])?.[1];
  const y = soft ? window.scrollY : 0;
  try { await hit[1](arg); } catch (error) {
    if (error.status === 401) { state.user = null; return renderLogin('Sessão expirada. Entre de novo.'); }
    const main = app.querySelector('[data-main]') || frame('AN Software');
    main.innerHTML = `<div class="error">${esc(clean(error))}</div><div class="actions"><button type="button" class="btn" data-act="retry">Tentar de novo</button></div>`;
  }
  if (soft) window.scrollTo(0, y); else window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => route());

// ---------------------------------------------------------------- pedaços de tela
function taskRow(t, clients) {
  const late = t.status !== 'concluida' && t.due_date && t.due_date < localDay();
  const who = t.assigned_to ? userName(t.assigned_to) : '';
  const sub = [t.kind && KIND[t.kind], clients?.get(t.client_id)?.name, who && `→ ${who}`].filter(Boolean).join(' · ');
  return `<li class="row ${t.status === 'concluida' ? 'done' : ''}">
    <button type="button" class="tick ${t.status === 'concluida' ? 'on' : ''}" data-act="toggle-task" data-id="${esc(t.id)}" aria-label="${t.status === 'concluida' ? 'Reabrir' : 'Concluir'}" ${canEditTask(t) ? '' : 'disabled'}></button>
    <a class="main" href="#/tarefa/${esc(t.id)}"><span class="title">${t.priority === 'alta' ? '<span class="tag alta">alta</span> ' : ''}${esc(t.title)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</a>
    <span class="side ${late ? 'late' : ''}">${t.due_date ? formatDate(t.due_date).slice(0, 5) : ''}${t.due_time ? `<br>${esc(t.due_time)}` : ''}</span></li>`;
}
const pubRow = (m) => `<li><a class="row" href="#/publicacao/${esc(m.id)}"><span class="main"><span class="title">${m.read_at ? '' : '<span class="tag unread">nova</span> '}${esc(m.title || m.kind || 'Publicação')}</span><span class="sub">${esc([m.process_number, m.tribunal].filter(Boolean).join(' · '))}</span></span><span class="side">${m.date ? formatDate(String(m.date).slice(0, 10)).slice(0, 5) : ''}</span></a></li>`;
const visibleTasks = (all) => all.filter((t) => !isFutureCharge(t, localDay()));
const isMine = (t) => t.assigned_to === state.user.id || (!t.assigned_to && (!t.sector || !(state.user.sectors || []).length || state.user.sectors.includes(t.sector)));

// ---------------------------------------------------------------- Hoje
async function screenHoje() {
  const main = frame(`Olá, ${state.user.name.split(' ')[0]}`, { tab: 'hoje', fab: canWrite(state.user) ? '#/nova-tarefa' : null });
  const [tasks, unread, clients] = await Promise.all([cached('tasks', () => state.data.tasks()), state.data.unread(), clientsMap()]);
  setUnread(unread.length);
  const open = visibleTasks(tasks).filter((t) => t.status !== 'concluida' && isMine(t));
  const t0 = localDay();
  const late = open.filter((t) => t.due_date && t.due_date < t0); const now = open.filter((t) => t.due_date === t0);
  const next = open.filter((t) => t.due_date > t0 && t.due_date <= localDay(3));
  main.innerHTML = `<div class="stats"><a class="stat ${late.length ? 'danger' : ''}" href="#/tarefas"><strong>${late.length}</strong><span>atrasada(s)</span></a>
      <a class="stat" href="#/tarefas"><strong>${now.length}</strong><span>para hoje</span></a><a class="stat" href="#/publicacoes"><strong>${unread.length}</strong><span>publicação(ões)</span></a></div>
    ${late.length ? `<p class="group danger">Atrasadas</p><ul class="list">${late.map((t) => taskRow(t, clients)).join('')}</ul>` : ''}
    <p class="group">Hoje</p>${now.length ? `<ul class="list">${now.map((t) => taskRow(t, clients)).join('')}</ul>` : '<div class="card empty">Nada para hoje. 🎉</div>'}
    ${next.length ? `<p class="group">Próximos 3 dias</p><ul class="list">${next.map((t) => taskRow(t, clients)).join('')}</ul>` : ''}
    ${unread.length ? `<p class="group">Publicações não lidas</p><ul class="list">${unread.slice(0, 5).map(pubRow).join('')}</ul>${unread.length > 5 ? '<a class="btn" href="#/publicacoes">Ver todas</a>' : ''}` : ''}
    <p class="hint">Mostra o que está atribuído a você e o que é do seu setor sem responsável.</p>`;
}

// ---------------------------------------------------------------- Tarefas
async function screenTasks() {
  const main = frame('Tarefas e prazos', { tab: 'tarefas', fab: canWrite(state.user) ? '#/nova-tarefa' : null });
  const [tasks, clients] = await Promise.all([cached('tasks', () => state.data.tasks()), clientsMap()]);
  const f = state.filters.tasks || 'meus';
  const t0 = localDay();
  let list = visibleTasks(tasks);
  if (f === 'concluidas') list = list.filter((t) => t.status === 'concluida');
  else {
    list = list.filter((t) => t.status !== 'concluida');
    if (f === 'minhas') list = list.filter((t) => t.assigned_to === state.user.id);
    if (f === 'meus') list = list.filter(isMine);
  }
  const groups = [['Atrasadas', (t) => t.due_date && t.due_date < t0, 'danger'], ['Hoje', (t) => t.due_date === t0], ['Amanhã', (t) => t.due_date === localDay(1)],
    ['Próximos dias', (t) => t.due_date > localDay(1)], ['Sem data', (t) => !t.due_date]];
  const body = f === 'concluidas' ? (list.length ? `<ul class="list">${list.map((t) => taskRow(t, clients)).join('')}</ul>` : '<div class="card empty">Nenhuma tarefa concluída nos últimos 7 dias.</div>')
    : groups.map(([label, fn, cls]) => { const items = list.filter(fn); return items.length ? `<p class="group ${cls || ''}">${label} (${items.length})</p><ul class="list">${items.map((t) => taskRow(t, clients)).join('')}</ul>` : ''; }).join('') || '<div class="card empty">Nenhuma tarefa aqui.</div>';
  main.innerHTML = `<div class="seg" role="group">${[['meus', 'Minhas e do setor'], ['minhas', 'Só minhas'], ['todas', 'Todas'], ['concluidas', 'Concluídas']].map(([k, l]) => `<button type="button" data-act="filter" data-key="tasks" data-val="${k}" aria-pressed="${k === f}">${l}</button>`).join('')}</div>${body}`;
}

async function screenTask(id) {
  const main = frame('Tarefa', { back: '#/tarefas' });
  const [t, clients, cases] = await Promise.all([state.data.task(id), clientsMap(), casesMap()]);
  if (!t) { main.innerHTML = '<div class="card empty">Tarefa não encontrada (ou sem acesso).</div>'; return; }
  const kase = cases.get(t.case_id); const client = clients.get(t.client_id);
  const can = canEditTask(t);
  const rows = [['Data', t.due_date ? `${formatDate(t.due_date)}${t.due_time ? ` às ${esc(t.due_time)}` : ''}` : 'Sem data'], ['Tipo', esc(KIND[t.kind] || t.kind || '')], ['Situação', esc(STATUS[t.status] || t.status || '')],
    ['Atribuída a', esc(userName(t.assigned_to) || (t.assigned_to ? '(pessoa sem acesso ativo)' : 'Ninguém'))], ['Setor', esc(sectorLabel(t.sector))],
    ['Cliente', client ? `<a href="#/cliente/${esc(client.id)}">${esc(client.name)}</a>` : ''], ['Processo', kase ? `<a href="#/processo/${esc(kase.id)}">${esc(kase.number)}</a>` : ''],
    ['Descrição', esc(t.description || '').replace(/\n/g, '<br>')]].filter(([, v]) => v);
  main.innerHTML = `<div class="card head-card"><h2>${esc(t.title)}</h2>${t.priority === 'alta' ? '<p><span class="tag alta">prioridade alta</span></p>' : ''}</div>
    <div class="card"><dl class="fields">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></div>
    <div class="actions">${t.status === 'concluida' ? `<button type="button" class="btn" data-act="set-task" data-id="${esc(t.id)}" data-status="pendente" ${can ? '' : 'disabled'}>Reabrir</button>`
      : `<button type="button" class="btn primary" data-act="set-task" data-id="${esc(t.id)}" data-status="concluida" ${can ? '' : 'disabled'}>Concluir</button>${t.status !== 'andamento' ? `<button type="button" class="btn" data-act="set-task" data-id="${esc(t.id)}" data-status="andamento" ${can ? '' : 'disabled'}>Em andamento</button>` : ''}`}</div>
    ${t.due_date ? `<div class="actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(googleCalendarUrl({ title: t.title, date: t.due_date, time: t.due_time, details: [kase && `Processo ${kase.number}`, client && `Cliente: ${client.name}`, t.description].filter(Boolean).join('\n') }))}">Agendar no Google Agenda</a></div>` : ''}
    ${can ? '' : `<p class="hint">${canWrite(state.user) ? `Atribuída a ${esc(userName(t.assigned_to) || 'outra pessoa')}: só ela ou um administrador altera.` : 'Seu acesso é só de consulta.'}</p>`}
    <p class="hint">Para editar todos os campos, use o app do computador.</p>`;
}

async function screenNewTask(caseId) {
  const main = frame('Nova tarefa', { back: caseId ? `#/processo/${caseId}` : '#/tarefas' });
  const [cases, clients] = await Promise.all([cached('cases', () => state.data.cases()), clientsMap()]);
  const mine = state.user.sectors?.[0] || '';
  const labelOf = (c) => ({ title: clients.get(c.client_id)?.name || 'Sem cliente', sub: [c.number || '(sem número)', c.class_name || c.subject, c.opposing_party && `× ${c.opposing_party}`].filter(Boolean).join(' · ') });
  const chosen = cases.find((c) => c.id === caseId);
  main.innerHTML = `<form class="sheet card" data-form="task">
    <label>Título<input name="title" required placeholder="O que precisa ser feito"></label>
    <div class="two"><label>Data<input type="date" name="due_date" value="${localDay()}"></label><label>Hora<input type="time" name="due_time"></label></div>
    <div class="two"><label>Tipo<select name="kind">${Object.entries(KIND).filter(([k]) => k !== 'cobranca').map(([k, l]) => `<option value="${k}" ${k === 'tarefa' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Prioridade<select name="priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></label></div>
    <div class="two"><label>Atribuída a<select name="assigned_to"><option value="">(ninguém)</option>${state.directory.map((u) => `<option value="${esc(u.id)}" ${u.id === state.user.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
      <label>Setor<select name="sector"><option value=""></option>${SECTORS.filter(([k]) => k !== 'financeiro' || state.user.finance).map(([k, l]) => `<option value="${k}" ${k === mine ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="picker"><span class="picker-label">Processo (opcional)</span><input type="hidden" name="case_id" value="${esc(chosen?.id || '')}">
      <div class="picker-chosen" data-chosen ${chosen ? '' : 'hidden'}>${chosen ? `<span class="main"><span class="title">${esc(labelOf(chosen).title)}</span><span class="sub">${esc(labelOf(chosen).sub)}</span></span>` : ''}<button type="button" class="link" data-clear-case>Trocar</button></div>
      <input type="search" class="search" data-case-search placeholder="Digite o cliente, a parte ou o número" autocomplete="off" ${chosen ? 'hidden' : ''}>
      <ul class="list picker-list" data-case-results hidden></ul></div>
    <label>Descrição<textarea name="description" rows="3"></textarea></label>
    <button class="btn primary" type="submit">Criar tarefa</button><p class="msg" data-msg></p></form>`;
  // Escolher o processo pelo nome do cliente / parte / pedaço do número (a lista do celular só mostrava o número).
  const form = main.querySelector('form'); const input = form.querySelector('[data-case-search]'); const results = form.querySelector('[data-case-results]');
  const chosenBox = form.querySelector('[data-chosen]');
  const show = (text) => {
    const q = norm(text); const digits = String(text).replace(/\D/g, '');
    const list = cases.filter((c) => !q || [clients.get(c.client_id)?.name, c.number, c.class_name, c.opposing_party, c.subject].some((v) => norm(v).includes(q)) || (digits.length >= 3 && String(c.number || '').replace(/\D/g, '').includes(digits)))
      .sort((a, b) => labelOf(a).title.localeCompare(labelOf(b).title, 'pt-BR')).slice(0, 30);
    results.innerHTML = list.map((c) => `<li><button type="button" class="row" data-pick-case="${esc(c.id)}"><span class="main"><span class="title">${esc(labelOf(c).title)}</span><span class="sub">${esc(labelOf(c).sub)}</span></span></button></li>`).join('') || '<li class="empty">Nenhum processo encontrado.</li>';
    results.hidden = false;
  };
  input.addEventListener('focus', () => show(input.value));
  input.addEventListener('input', () => show(input.value));
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick-case]'); if (!b) return;
    const c = cases.find((x) => x.id === b.dataset.pickCase);
    form.elements.case_id.value = c.id;
    chosenBox.innerHTML = `<span class="main"><span class="title">${esc(labelOf(c).title)}</span><span class="sub">${esc(labelOf(c).sub)}</span></span><button type="button" class="link" data-clear-case>Trocar</button>`;
    chosenBox.hidden = false; input.hidden = true; results.hidden = true;
  });
  chosenBox.addEventListener('click', (e) => {
    if (!e.target.closest('[data-clear-case]')) return;
    form.elements.case_id.value = ''; chosenBox.hidden = true; input.hidden = false; input.value = ''; input.focus();
  });
}

// ---------------------------------------------------------------- Processos
async function screenCases() {
  const main = frame('Processos', { tab: 'processos' });
  const [cases, clients] = await Promise.all([cached('cases', () => state.data.cases()), clientsMap()]);
  const q = state.filters.casesQ || '';
  const rows = (list) => list.map((c) => `<li><a class="row" href="#/processo/${esc(c.id)}"><span class="main"><span class="title">${esc(c.number || '(sem número)')}</span><span class="sub">${esc([clients.get(c.client_id)?.name, c.class_name || c.subject, c.tribunal].filter(Boolean).join(' · '))}</span></span>${c.status && c.status !== 'ativo' ? `<span class="side">${esc(c.status)}</span>` : ''}</a></li>`).join('');
  const filter = (text) => cases.filter((c) => !text || [c.number, clients.get(c.client_id)?.name, c.class_name, c.opposing_party, c.subject].some((v) => norm(v).includes(norm(text))) || String(c.number || '').replace(/\D/g, '').includes(text.replace(/\D/g, '') || '§'));
  main.innerHTML = `<input class="search" type="search" placeholder="Buscar por número, cliente ou parte" value="${esc(q)}" data-search="cases" aria-label="Buscar processo"><ul class="list" data-results>${rows(filter(q)) || '<li class="empty">Nenhum processo.</li>'}</ul>`;
  main.querySelector('[data-search]').addEventListener('input', (e) => { state.filters.casesQ = e.target.value; main.querySelector('[data-results]').innerHTML = rows(filter(e.target.value)) || '<li class="empty">Nenhum processo.</li>'; });
}

async function screenCase(id) {
  const main = frame('Processo', { back: '#/processos', fab: canWrite(state.user) ? `#/nova-tarefa/${id}` : null });
  const [c, clients] = await Promise.all([state.data.caseById(id), clientsMap()]);
  if (!c) { main.innerHTML = '<div class="card empty">Processo não encontrado (ou sem acesso).</div>'; return; }
  const [movements, tasks, terms] = await Promise.all([state.data.movements(id), state.data.caseTasks(id), state.user.finance ? state.data.caseTerms(id) : null]);
  const client = clients.get(c.client_id);
  const open = visibleTasks(tasks).filter((t) => t.status !== 'concluida');
  const details = [['Vara / órgão', c.organ], ['Assunto', c.subject], ['Partes', c.parties], ['Valor da causa', c.value ? formatBRL(c.value) : ''], ['Distribuição', c.started_at ? formatDate(String(c.started_at).slice(0, 10)) : ''], ['Honorários contratados', terms?.fee_terms], ['Observações', c.notes]].filter(([, v]) => v);
  main.innerHTML = `<div class="card head-card"><h2>${esc(c.number || 'Processo sem número')}</h2>
      <p>${client ? `<a href="#/cliente/${esc(client.id)}">${esc(client.name)}</a>` : 'Sem cliente'}${c.client_role ? ` · ${esc(ROLE[c.client_role] || c.client_role)}` : ''}${c.opposing_party ? ` × ${esc(c.opposing_party)}` : ''}</p>
      <div class="chips">${[c.tribunal, c.class_name, c.status].filter(Boolean).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div></div>
    <div class="actions"><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(googleCalendarUrl({ title: `Compromisso — ${c.number || 'processo'}`, date: localDay(), details: [client && `Cliente: ${client.name}`, c.organ].filter(Boolean).join('\n') }))}">Agendar no Google Agenda</a></div>
    <p class="group">Publicações e andamentos (${movements.length})</p>
    <div class="card">${movements.length ? `<ol class="tl">${movements.map((m) => `<li class="${m.source === 'djen' ? 'djen' : ''}"><div class="when">${m.date ? formatDate(String(m.date).slice(0, 10)) : 'sem data'} <span class="tag ${m.source === 'djen' ? 'djen' : ''}">${m.source === 'djen' ? 'Publicação' : 'Andamento'}</span>${m.source === 'djen' && !m.read_at ? ' <span class="tag unread">nova</span>' : ''}</div>
        <div>${esc(m.title || m.kind || 'Movimentação')}</div>${m.source === 'djen' ? `<button type="button" class="link" data-act="read" data-id="${esc(m.id)}">Ler</button>` : ''}${m.link ? ` <a class="link" href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">Abrir no tribunal</a>` : ''}<div data-body="${esc(m.id)}" hidden></div></li>`).join('')}</ol>` : '<p class="hint">Nenhuma publicação ou andamento ainda.</p>'}</div>
    <p class="group">Tarefas em aberto (${open.length})</p>${open.length ? `<ul class="list">${open.map((t) => taskRow(t, clients)).join('')}</ul>` : '<div class="card empty">Nenhuma tarefa em aberto.</div>'}
    ${details.length ? `<p class="group">Detalhes</p><div class="card"><dl class="fields">${details.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v).replace(/\n/g, '<br>')}</dd></div>`).join('')}</dl></div>` : ''}`;
}

/** Texto da publicação formatado (prazos e "sob pena de" destacados), como no computador. */
function readingHtml(m) {
  const { header, title, paragraphs } = teorParts(m.text);
  return `${header ? `<p class="head">${esc(header)}</p>` : ''}${title ? `<p><strong>${esc(title)}</strong></p>` : ''}${paragraphs.map((p) => `<p>${paragraphHtml(p)}</p>`).join('') || '<p class="hint">Sem texto.</p>'}`;
}

// ---------------------------------------------------------------- Publicações
async function screenPubs() {
  const main = frame('Publicações', { tab: 'publicacoes' });
  const f = state.filters.pubs || 'novas';
  const list = f === 'novas' ? await state.data.unread() : await state.data.recentPublications();
  if (f === 'novas') setUnread(list.length);
  main.innerHTML = `<div class="seg">${[['novas', 'Não lidas'], ['recentes', 'Recentes']].map(([k, l]) => `<button type="button" data-act="filter" data-key="pubs" data-val="${k}" aria-pressed="${k === f}">${l}</button>`).join('')}</div>
    ${list.length ? `<ul class="list">${list.map(pubRow).join('')}</ul>` : `<div class="card empty">${f === 'novas' ? 'Nenhuma publicação nova.' : 'Nenhuma publicação.'}</div>`}`;
}

async function screenPub(id) {
  const main = frame('Publicação', { back: '#/publicacoes' });
  const m = await state.data.movement(id);
  if (!m) { main.innerHTML = '<div class="card empty">Publicação não encontrada.</div>'; return; }
  // Abrir é ler: marca como lida (quem só consulta não marca).
  if (!m.read_at && state.user) { try { await state.data.markRead(m.id, true); m.read_at = new Date().toISOString(); delete state.cache.unread; } catch { /* segue */ } }
  main.innerHTML = `<div class="card head-card"><h2>${esc(m.title || m.kind || 'Publicação')}</h2><p>${esc([m.date && formatDate(String(m.date).slice(0, 10)), m.process_number, m.tribunal, m.organ].filter(Boolean).join(' · '))}</p></div>
    <div class="card reading">${readingHtml(m)}</div>
    <div class="actions">${m.case_id ? `<a class="btn primary" href="#/processo/${esc(m.case_id)}">Abrir o processo</a>` : ''}${m.link ? `<a class="btn" href="${esc(m.link)}" target="_blank" rel="noopener noreferrer">Abrir no tribunal</a>` : ''}
      ${state.user ? `<button type="button" class="btn" data-act="unread" data-id="${esc(m.id)}">Marcar como não lida</button>` : ''}</div>
    <p class="hint">Para criar o prazo a partir desta publicação, use a tela Publicações do app do computador (ela calcula a meta e o prazo fatal).</p>`;
}

// ---------------------------------------------------------------- Clientes
async function screenClients() {
  const main = frame('Clientes', { tab: 'mais', back: '#/mais' });
  const clients = await cached('clients', () => state.data.clients());
  const q = state.filters.clientsQ || '';
  const rows = (text) => clients.filter((c) => !text || [c.name, c.document, c.city, c.phone].some((v) => norm(v).includes(norm(text)))).map((c) => `<li><a class="row" href="#/cliente/${esc(c.id)}"><span class="main"><span class="title">${esc(c.name)}</span><span class="sub">${esc([c.phone || c.whatsapp, c.city].filter(Boolean).join(' · '))}</span></span></a></li>`).join('') || '<li class="empty">Nenhum cliente.</li>';
  main.innerHTML = `<input class="search" type="search" placeholder="Buscar cliente" value="${esc(q)}" aria-label="Buscar cliente" data-search="clients"><ul class="list" data-results>${rows(q)}</ul>`;
  main.querySelector('[data-search]').addEventListener('input', (e) => { state.filters.clientsQ = e.target.value; main.querySelector('[data-results]').innerHTML = rows(e.target.value); });
}

async function screenClient(id) {
  const main = frame('Cliente', { back: '#/clientes' });
  const [c, cases] = await Promise.all([state.data.client(id), state.data.clientCases(id)]);
  if (!c) { main.innerHTML = '<div class="card empty">Cliente não encontrado.</div>'; return; }
  const phone = c.whatsapp || c.phone;
  const address = [c.street && `${c.street}${c.number ? `, ${c.number}` : ''}`, c.district, c.city && `${c.city}${c.uf ? `/${c.uf}` : ''}`].filter(Boolean).join(' · ');
  main.innerHTML = `<div class="card head-card"><h2>${esc(c.name)}</h2><p>${esc([c.type === 'PJ' ? 'Pessoa jurídica' : 'Pessoa física', c.document].filter(Boolean).join(' · '))}</p></div>
    <div class="actions">${c.phone ? `<a class="btn" href="tel:${esc(phoneDigits(c.phone))}">Ligar</a>` : ''}${phone ? `<a class="btn primary" href="https://wa.me/${esc(phoneDigits(phone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">E-mail</a>` : ''}</div>
    <div class="card"><dl class="fields">${[['Telefone', c.phone], ['WhatsApp', c.whatsapp], ['E-mail', c.email], ['Endereço', address], ['Observações', c.notes]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('') || '<p class="hint">Sem contato cadastrado.</p>'}</dl></div>
    <p class="group">Processos (${cases.length})</p>${cases.length ? `<ul class="list">${cases.map((k) => `<li><a class="row" href="#/processo/${esc(k.id)}"><span class="main"><span class="title">${esc(k.number || '(sem número)')}</span><span class="sub">${esc([k.class_name, k.tribunal].filter(Boolean).join(' · '))}</span></span></a></li>`).join('')}</ul>` : '<div class="card empty">Nenhum processo.</div>'}`;
}

// ---------------------------------------------------------------- Financeiro (só quem vê)
async function screenFees() {
  const main = frame('Financeiro', { tab: 'mais', back: '#/mais' });
  if (!state.user.finance) { main.innerHTML = '<div class="card empty">Seu acesso não inclui o financeiro.</div>'; return; }
  const [fees, clients] = await Promise.all([state.data.fees(), clientsMap()]);
  const f = state.filters.fees || 'atrasados'; const t0 = localDay();
  const list = fees.filter((x) => x.status === 'aberto' && (f === 'atrasados' ? x.due_date && x.due_date < t0 : f === 'proximos' ? x.due_date >= t0 && x.due_date <= localDay(30) : true));
  const total = list.reduce((n, x) => n + (Number(x.amount) || 0), 0);
  main.innerHTML = `<div class="seg">${[['atrasados', 'Atrasados'], ['proximos', 'Próximos 30 dias'], ['todos', 'Todos a receber']].map(([k, l]) => `<button type="button" data-act="filter" data-key="fees" data-val="${k}" aria-pressed="${k === f}">${l}</button>`).join('')}</div>
    <div class="card"><strong>${formatBRL(total)}</strong> <span class="hint">em ${list.length} lançamento(s)</span></div>
    ${list.length ? `<ul class="list">${list.map((x) => `<li><a class="row" href="#/lancamento/${esc(x.id)}"><span class="main"><span class="title">${esc(clients.get(x.client_id)?.name || x.description)}</span><span class="sub">${esc(x.description)}</span></span><span class="side ${x.due_date && x.due_date < t0 ? 'late' : ''}">${x.amount ? formatBRL(x.amount) : ''}<br>${x.due_date ? formatDate(x.due_date) : ''}</span></a></li>`).join('')}</ul>` : '<div class="card empty">Nada aqui.</div>'}`;
}

async function screenFee(id) {
  const main = frame('Lançamento', { back: '#/financeiro' });
  const [x, clients] = await Promise.all([state.data.fee(id), clientsMap()]);
  if (!x) { main.innerHTML = '<div class="card empty">Lançamento não encontrado (ou sem acesso).</div>'; return; }
  const client = clients.get(x.client_id);
  main.innerHTML = `<div class="card head-card"><h2>${esc(x.description)}</h2><p>${client ? `<a href="#/cliente/${esc(client.id)}">${esc(client.name)}</a>` : ''}</p></div>
    <div class="card"><dl class="fields">${[['Valor', x.amount ? formatBRL(x.amount) : (x.percent ? `${x.percent}%` : '')], ['Vencimento', x.due_date ? formatDate(x.due_date) : ''], ['Situação', x.status === 'pago' ? 'Recebido' : x.status === 'condicional' ? 'Condicional' : 'A receber'], ['Responsável pela cobrança', userName(x.assigned_to)], ['Observações', x.notes]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div>
    <div class="actions">${x.status === 'aberto' && canWrite(state.user) ? `<button type="button" class="btn primary" data-act="pay" data-id="${esc(x.id)}">Marcar como recebido</button>` : ''}
      ${x.status === 'aberto' && (client?.whatsapp || client?.phone) ? `<button type="button" class="btn" data-act="charge" data-id="${esc(x.id)}">Mensagem de cobrança (WhatsApp)</button>` : ''}</div>`;
}

// ---------------------------------------------------------------- Mais
async function screenMore() {
  const main = frame('Mais', { tab: 'mais' });
  const u = state.user;
  main.innerHTML = `<div class="card head-card"><h2>${esc(u.name)}</h2><p>${esc(u.roleLabel)}${u.sectors?.length ? ` · ${esc(u.sectors.map(sectorLabel).join(', '))}` : ''}</p><p>${esc(u.email || '')}</p></div>
    <ul class="list"><li><a class="row" href="#/notificacoes"><span class="main"><span class="title">Notificações</span><span class="sub">Escolher o que receber, no celular e no computador</span></span><span class="side">${state.feedUnread ? `<span class="badge">${state.feedUnread}</span>` : '›'}</span></a></li><li><a class="row" href="#/clientes"><span class="main"><span class="title">Clientes</span><span class="sub">Contatos, WhatsApp e processos</span></span><span class="side">›</span></a></li>
      ${u.finance ? '<li><a class="row" href="#/financeiro"><span class="main"><span class="title">Financeiro</span><span class="sub">A receber, atrasados e cobrança</span></span><span class="side">›</span></a></li>' : ''}</ul>
    <div class="card"><h2>Instalar no celular</h2><p class="hint"><strong>Android (Chrome):</strong> menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".<br><strong>iPhone (Safari):</strong> botão Compartilhar → "Adicionar à Tela de Início".<br>O app se atualiza sozinho.</p></div>
    <div class="actions"><button type="button" class="btn danger" data-act="logout">Sair</button></div>
    <p class="hint">AN Software no celular · versão ${APP_VERSION}${DEMO ? ' · MODO DEMONSTRAÇÃO (dados fictícios)' : ''}</p>`;
}

// ---------------------------------------------------------------- ações (cliques e formulários)
app.addEventListener('click', async (e) => {
  const go = e.target.closest('[data-go]'); if (go) { location.hash = go.dataset.go; return; }
  const btn = e.target.closest('[data-act]'); if (!btn || btn.disabled) return;
  const { act, id } = btn.dataset;
  try {
    if (act === 'signup') return renderSignup();
    if (act === 'login') return renderLogin();
    if (act === 'forgot') { app.querySelector('[data-msg]').textContent = 'Peça a um administrador do escritório: na tela Usuários do computador ele define uma senha provisória para você.'; return; }
    if (act === 'logout') { realtime?.stop(); realtime = null; await cloud.signOut(); state.user = null; state.cache = {}; return renderLogin(); }
    if (act === 'retry') return route();
    if (act === 'filter') { state.filters[btn.dataset.key] = btn.dataset.val; return route(); }
    if (act === 'toggle-task' || act === 'set-task') {
      const tasks = state.cache.tasks || [];
      const cur = tasks.find((t) => t.id === id);
      const status = act === 'set-task' ? btn.dataset.status : (cur?.status === 'concluida' ? 'pendente' : 'concluida');
      btn.disabled = true;
      const saved = await state.data.setTaskStatus(id, status);
      if (cur) Object.assign(cur, saved);
      toast(status === 'concluida' ? 'Tarefa concluída.' : 'Tarefa atualizada.');
      delete state.cache.tasks;
      return route(true);
    }
    if (act === 'read') {
      const body = app.querySelector(`[data-body="${CSS.escape(id)}"]`);
      if (!body.hidden) { body.hidden = true; btn.textContent = 'Ler'; return; }
      const m = await state.data.movement(id);
      body.className = 'reading'; body.innerHTML = readingHtml(m || {}); body.hidden = false; btn.textContent = 'Fechar';
      if (m && !m.read_at && state.user) { state.data.markRead(id, true).catch(() => {}); btn.closest('li')?.querySelector('.tag.unread')?.remove(); }
      return;
    }
    if (act === 'push-on') { btn.disabled = true; await enablePush({ data: state.data, demo: DEMO }); toast('Notificações ligadas neste celular.'); return route(true); }
    if (act === 'push-off') { await disablePush({ data: state.data, demo: DEMO }); toast('Notificações desligadas neste celular.'); return route(true); }
    if (act === 'push-test') { btn.disabled = true; const r = await sendTest(); toast(r.sent ? 'Teste enviado — deve chegar em instantes.' : 'Nenhum aparelho recebeu. Desligue e ligue de novo aqui.'); btn.disabled = false; return; }
    if (act === 'feed-read-all') { const ids = (await state.data.feed()).filter((f) => !f.read_at).map((f) => f.id); if (ids.length) await state.data.markFeedRead(ids); await refreshBell(); return route(true); }
    if (act === 'feed-open') { state.data.markFeedRead([Number(id)]).then(refreshBell).catch(() => {}); if (btn.dataset.url) location.hash = btn.dataset.url; else route(true); return; }
    if (act === 'unread') { await state.data.markRead(id, false); toast('Marcada como não lida.'); location.hash = '#/publicacoes'; return; }
    if (act === 'pay') {
      if (!confirm('Marcar este lançamento como recebido hoje?')) return;
      const fee = await state.data.fee(id); await state.data.payFee(fee); toast('Recebido. A tarefa de cobrança foi concluída.'); delete state.cache.tasks; return route(true);
    }
    if (act === 'charge') {
      const fee = await state.data.fee(id); const client = (await clientsMap()).get(fee.client_id);
      let template = DEFAULT_CHARGE_TEMPLATE;
      try { const rows = await cloud.rest('GET', 'settings?key=eq.charge_template&select=value'); if (rows?.[0]?.value) template = rows[0].value; } catch { /* modelo padrão */ }
      window.open(whatsappUrl(client.whatsapp || client.phone, chargeMessage(fee, client, { today: localDay(), template })), '_blank', 'noopener');
      return;
    }
  } catch (error) { btn.disabled = false; toast(clean(error)); }
});

app.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]'); if (!form) return;
  e.preventDefault();
  const msg = form.querySelector('[data-msg]'); const f = form.elements; const submit = form.querySelector('[type=submit]');
  const run = async (fn) => { msg.textContent = ''; submit.disabled = true; try { await fn(); } catch (error) { msg.textContent = clean(error); } finally { submit.disabled = false; } };
  if (form.dataset.form === 'login') return run(async () => {
    msg.textContent = 'Entrando…';
    try { localStorage.setItem('an.mobile.email', f.email.value.trim()); } catch { /* sem armazenamento */ }
    await cloud.signIn(f.email.value, f.pw.value, f.remember.checked);
    msg.textContent = ''; await afterLogin();
  });
  if (form.dataset.form === 'signup') return run(async () => {
    if (titleCase(f.name.value).length < 2) throw new Error('Informe o seu nome.');
    if (f.pw.value.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (f.pw.value !== f.pw2.value) throw new Error('As senhas não conferem.');
    await cloud.signUp(titleCase(f.name.value), f.email.value, f.pw.value);
    renderLogin('Pedido de acesso enviado. Avise um administrador do escritório para aprovar; depois entre com o seu e-mail e senha.');
  });
  if (form.dataset.form === 'change') return run(async () => {
    if (f.pw.value.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
    if (f.pw.value !== f.pw2.value) throw new Error('As senhas não conferem.');
    await cloud.updatePassword(f.pw.value);
    await cloud.rest('PATCH', `profiles?id=eq.${encodeURIComponent(state.user.id)}`, { body: { must_change: false } }).catch(() => {});
    state.user.must_change = false; await startShell();
  });
  if (form.dataset.form === 'prefs') return run(async () => {
    await state.data.savePrefs(prefsFromForm(form, state.user));
    msg.textContent = ''; toast('Preferências salvas (valem no celular e no computador).');
  });
  if (form.dataset.form === 'task') return run(async () => {
    if (!f.title.value.trim()) throw new Error('Informe o título.');
    const t = await state.data.createTask({ title: f.title.value.trim(), due_date: f.due_date.value || null, due_time: f.due_time.value || null, kind: f.kind.value, priority: f.priority.value,
      assigned_to: f.assigned_to.value || null, sector: f.sector.value || null, case_id: f.case_id.value || null, description: f.description.value.trim() || null,
      client_id: (await casesMap()).get(f.case_id.value)?.client_id || null });
    delete state.cache.tasks; toast('Tarefa criada.'); location.hash = `#/tarefa/${t.id}`;
  });
  return null;
});

// ---------------------------------------------------------------- início
async function boot() {
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (DEMO) { state.data = createDemoData(); state.user = DEMO_USER; return startShell(); }
  try { if (await cloud.resume()) return afterLogin(); } catch (error) { if (error.offline) return renderLogin('Sem internet: o app do celular precisa de conexão para mostrar os dados do escritório.'); }
  return renderLogin();
}
boot();

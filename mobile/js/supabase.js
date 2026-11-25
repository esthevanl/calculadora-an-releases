// Cliente do servidor (Supabase: login + REST) para o celular. Mesmas regras do app de computador (electron/cloud.cjs):
// só a chave pública + o token de quem entrou; o que cada um pode ler/gravar é decidido no servidor (RLS).
// Sessão: com "Lembrar de mim" o token de renovação fica no aparelho (localStorage); sem, só até fechar o app.
import { SUPABASE_URL, SUPABASE_KEY, REMEMBER_DAYS } from './config.js';

const STORE = 'an.mobile.session';
const MESSAGES = {
  invalid_credentials: 'E-mail ou senha incorretos.', invalid_grant: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'O servidor ainda pede confirmação por e-mail. Fale com o administrador master.',
  user_already_exists: 'Já existe um acesso com esse e-mail.', email_exists: 'Já existe um acesso com esse e-mail.',
  weak_password: 'Senha fraca: use pelo menos 8 caracteres.', over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde alguns minutos.',
  signup_disabled: 'Pedidos de acesso estão desligados no servidor.'
};

export class CloudError extends Error {
  constructor(message, { status = 0, code = '', offline = false } = {}) { super(message); Object.assign(this, { status, code, offline }); }
}

function messageFor(status, data) {
  const code = data?.error_code || data?.code || data?.error || '';
  if (MESSAGES[code]) return MESSAGES[code];
  if (code === '42501' || status === 403) return 'O servidor recusou: seu nível de acesso não permite isso.';
  if (data?.message && String(code) === 'P0001') return String(data.message);
  if (status === 401) return 'Sessão expirada. Entre de novo.';
  if (status >= 500) return `O servidor está com problema (HTTP ${status}). Tente de novo em instantes.`;
  const text = data?.msg || data?.message || data?.error_description || '';
  return text ? `Servidor: ${String(text).slice(0, 200)}` : `Servidor respondeu HTTP ${status}.`;
}

let session = null; // { access_token, refresh_token, expires_at, user, remember, email, at }
let refreshing = null;
const listeners = new Set();
const now = () => Date.now();

function persist() {
  try {
    localStorage.removeItem(STORE); sessionStorage.removeItem(STORE);
    if (!session?.refresh_token) return;
    const data = JSON.stringify({ refresh_token: session.refresh_token, email: session.email, at: session.at, remember: session.remember });
    (session.remember ? localStorage : sessionStorage).setItem(STORE, data);
  } catch { /* sem armazenamento: vale só nesta abertura */ }
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, {
      method,
      headers: { apikey: SUPABASE_KEY, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch { throw new CloudError('Sem conexão com o servidor. Confira a internet do celular.', { offline: true }); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new CloudError(messageFor(res.status, data), { status: res.status, code: String(data?.error_code || data?.code || data?.error || '') });
  return data;
}

function setSession(data, extra = {}) {
  if (!data?.access_token) session = null;
  else session = { ...(session || {}), ...extra, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Number(data.expires_at) || Math.floor(now() / 1000) + (Number(data.expires_in) || 3600), user: data.user || session?.user || null };
  persist();
  for (const fn of listeners) fn(session);
  return session;
}

async function refresh() {
  if (!session?.refresh_token) throw new CloudError('Entre com seu e-mail e senha.', { status: 401 });
  if (!refreshing) {
    refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then((d) => setSession(d))
      .catch((error) => { if (!error.offline) setSession(null); throw error; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function token() {
  if (!session) throw new CloudError('Entre com seu e-mail e senha.', { status: 401 });
  if (!session.access_token || session.expires_at - 60 <= now() / 1000) await refresh();
  return session.access_token;
}

async function authed(path, options = {}) {
  try { return await call(path, { ...options, token: await token() }); } catch (error) {
    if (error.status !== 401 || !session) throw error;
    await refresh();
    return call(path, { ...options, token: session.access_token });
  }
}

export const cloud = {
  get session() { return session; },
  onSession(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async signIn(email, password, remember) {
    const mail = String(email || '').trim().toLowerCase();
    const d = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: mail, password } });
    return setSession(d, { remember: Boolean(remember), email: mail, at: new Date().toISOString() });
  },
  async signUp(name, email, password) {
    const d = await call('/auth/v1/signup', { method: 'POST', body: { email: String(email).trim().toLowerCase(), password, data: { name: String(name || '').trim() } } });
    if (d?.access_token) { try { await call('/auth/v1/logout', { method: 'POST', token: d.access_token }); } catch { /* segue */ } }
    return { needsConfirm: !d?.access_token };
  },
  /** Abre o app: retoma a sessão guardada, se ainda valer (10 dias para quem não é master — conferido depois do perfil). */
  async resume() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || sessionStorage.getItem(STORE) || 'null'); } catch { saved = null; }
    if (!saved?.refresh_token) return null;
    session = { refresh_token: saved.refresh_token, email: saved.email, at: saved.at, remember: saved.remember, access_token: '', expires_at: 0 };
    try { await refresh(); } catch (error) { if (!error.offline) { session = null; persist(); } throw error; }
    return session;
  },
  /** O "lembrar de mim" venceu para este nível? (master não vence) */
  rememberExpired(role) {
    if (role === 'master' || !session?.remember) return false;
    const at = Date.parse(session.at || '');
    return !Number.isFinite(at) || now() - at > REMEMBER_DAYS * 864e5;
  },
  async signOut() {
    if (session?.access_token) { try { await call('/auth/v1/logout', { method: 'POST', token: session.access_token }); } catch { /* sai mesmo assim */ } }
    session = null; persist(); for (const fn of listeners) fn(null);
  },
  updatePassword(password) { return authed('/auth/v1/user', { method: 'PUT', body: { password } }); },
  rest(method, path, { body, prefer } = {}) { return authed(`/rest/v1/${path}`, { method, body, headers: prefer ? { Prefer: prefer } : {} }); },
  rpc(fn, args = {}) { return authed(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args }); }
};

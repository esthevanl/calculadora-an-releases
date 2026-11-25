// Tela "Notificações" do celular: caixa de notificações + o que eu quero receber e onde (celular / computador),
// horário do resumo da manhã, horário de silêncio, ligar/desligar neste celular e enviar um teste.
// As preferências ficam no servidor: valem para todos os aparelhos da pessoa.
import { token } from './supabase.js';
import { SUPABASE_KEY, NOTIFY_URL } from './config.js';
import { escapeHtml as esc, typesFor, effectivePrefs, DEFAULT_MORNING } from './shared.js';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const when = (iso) => { try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; } };
const b64ToBytes = (b64) => { const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };

async function callNotify(action) {
  const res = await fetch(NOTIFY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${await token()}` }, body: JSON.stringify({ action }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || (res.status === 404 ? 'A função de envio ainda não foi criada no servidor (Edge Function "notify").' : `Servidor respondeu HTTP ${res.status}.`));
  return data;
}

/** Situação deste aparelho: o que dá para fazer aqui. */
async function deviceState(demo) {
  if (demo) return { supported: false, reason: 'No modo demonstração as notificações do aparelho ficam desligadas.' };
  // Dentro do app Android (Capacitor) o aviso do celular precisa do serviço do Google (Firebase), que entra numa próxima versão.
  if (window.Capacitor?.isNativePlatform?.()) return { supported: false, reason: 'No app Android, os avisos no celular chegam numa próxima versão (precisa ligar o serviço de notificações do Google). Por enquanto, a caixa abaixo e os avisos do computador já funcionam.' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { supported: false, reason: isIos() && !standalone() ? 'No iPhone, primeiro instale o app: Safari → Compartilhar → "Adicionar à Tela de Início". Depois abra pelo ícone e ligue aqui.' : 'Este navegador não aceita notificações. Use o Chrome (Android) ou o app instalado (iPhone).' };
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { supported: true, on: Boolean(sub) && Notification.permission === 'granted', denied: Notification.permission === 'denied', sub };
}

export async function enablePush(ctx) {
  const st = await deviceState(ctx.demo);
  if (!st.supported) throw new Error(st.reason);
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Permissão negada. Libere as notificações do AN Software nas configurações do celular e tente de novo.');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await callNotify('public_key');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const j = sub.toJSON();
  await ctx.data.saveSubscription({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
}
export async function disablePush(ctx) {
  const st = await deviceState(ctx.demo);
  if (st.sub) { await ctx.data.deleteSubscription(st.sub.endpoint).catch(() => {}); await st.sub.unsubscribe(); }
}
export const sendTest = () => callNotify('test');

export async function screenNotifications(ctx) {
  const { frame, data, user } = ctx;
  const main = frame('Notificações', { tab: 'mais', back: '#/mais' });
  const [feed, saved, device] = await Promise.all([data.feed(), data.prefs(), deviceState(ctx.demo)]);
  const prefs = effectivePrefs(saved?.prefs, user);
  const types = typesFor(user);
  const unread = feed.filter((f) => !f.read_at);
  main.innerHTML = `
    <div class="card"><h2>Neste celular</h2>
      ${!device.supported ? `<p class="hint">${esc(device.reason)}</p>`
        : device.on ? '<p>✅ Notificações <strong>ligadas</strong> neste celular.</p><div class="actions"><button type="button" class="btn" data-act="push-test">Enviar um teste</button><button type="button" class="btn danger" data-act="push-off">Desligar neste celular</button></div>'
        : `<p class="hint">${device.denied ? 'As notificações estão bloqueadas nas configurações do celular para este app. Libere lá e volte aqui.' : 'Ligue para receber os avisos que você escolher abaixo, mesmo com o app fechado.'}</p><div class="actions"><button type="button" class="btn primary" data-act="push-on" ${device.denied ? 'disabled' : ''}>Ligar notificações neste celular</button></div>`}
    </div>
    <form class="card sheet" data-form="prefs"><h2>O que eu quero receber</h2>
      <p class="hint">Vale para todos os seus aparelhos. "Computador" é o aviso do Windows no app do escritório.</p>
      <table class="prefs"><thead><tr><th></th><th>Celular</th><th>Computador</th></tr></thead><tbody>
      ${types.map((t) => `<tr><td><strong>${esc(t.label)}</strong><br><span class="hint">${esc(t.help)}</span></td>
        <td><input type="checkbox" name="${t.key}.phone" ${prefs[t.key].phone ? 'checked' : ''} aria-label="${esc(t.label)} no celular"></td>
        <td><input type="checkbox" name="${t.key}.desktop" ${prefs[t.key].desktop ? 'checked' : ''} aria-label="${esc(t.label)} no computador"></td></tr>`).join('')}
      </tbody></table>
      <label>Horário do resumo da manhã<input type="time" name="morning_time" value="${esc(saved?.morning_time || DEFAULT_MORNING)}"></label>
      <div class="two"><label>Silêncio a partir de<input type="time" name="quiet_start" value="${esc(saved?.quiet_start || '')}"></label><label>até<input type="time" name="quiet_end" value="${esc(saved?.quiet_end || '')}"></label></div>
      <p class="hint">No silêncio nada é enviado; os avisos saem quando o silêncio acaba. Deixe em branco para não usar.</p>
      <button class="btn primary" type="submit">Salvar minhas preferências</button><p class="msg" data-msg></p>
    </form>
    <p class="group">Caixa de notificações${unread.length ? ` (${unread.length} nova${unread.length > 1 ? 's' : ''})` : ''}</p>
    ${feed.length ? `<ul class="list">${feed.map((f) => `<li><button type="button" class="row ${f.read_at ? '' : 'unread-row'}" data-act="feed-open" data-id="${f.id}" data-url="${esc(f.url || '')}">
        <span class="main"><span class="title">${f.read_at ? '' : '<span class="tag unread">nova</span> '}${esc(f.title)}</span><span class="sub">${esc(f.body || '')}</span></span><span class="side">${when(f.created_at)}</span></button></li>`).join('')}</ul>
      ${unread.length ? '<div class="actions"><button type="button" class="btn" data-act="feed-read-all">Marcar todas como lidas</button></div>' : ''}` : '<div class="card empty">Nenhuma notificação ainda.</div>'}`;
}

/** Lê o formulário de preferências no formato salvo no servidor. */
export function prefsFromForm(form, user) {
  const prefs = {};
  for (const t of typesFor(user)) prefs[t.key] = { phone: form.elements[`${t.key}.phone`].checked, desktop: form.elements[`${t.key}.desktop`].checked };
  const v = (n) => form.elements[n].value || null;
  if ((v('quiet_start') && !v('quiet_end')) || (!v('quiet_start') && v('quiet_end'))) throw new Error('Preencha o início e o fim do silêncio (ou deixe os dois em branco).');
  return { prefs, morning_time: v('morning_time') || DEFAULT_MORNING, quiet_start: v('quiet_start'), quiet_end: v('quiet_end') };
}

// GERADO de electron/cloud-realtime.cjs por scripts/build-mobile.cjs (não edite aqui). Aviso em tempo real do servidor.
// Não traz os dados: só avisa "a tabela X mudou" e o app faz a busca normal (cloud-sync.cjs), que já cuida
// de conflitos e da fila. Se o aviso cair (internet instável), reconecta sozinho; a busca periódica é a reserva.
// Sem Electron: recebe a classe WebSocket e os temporizadores para os testes.

export const TABLES = ['clients', 'partners', 'cases', 'case_terms', 'tasks', 'movements', 'fees', 'calculations', 'settings', 'profiles', 'notification_feed'];
const BACKOFF = [2000, 5000, 15000, 30000, 60000];

export function createRealtime({ url, key, getToken, onChange, onState = () => {}, log = () => {}, WebSocketImpl = globalThis.WebSocket, timers = globalThis, heartbeatMs = 25000 }) {
  const endpoint = `${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`;
  const topic = 'realtime:an-escritorio';
  let ws = null; let ref = 0; let joinRef = null; let beat = null; let retry = null; let attempt = 0;
  let wanted = false; let live = false;

  const setLive = (v) => { if (live !== v) { live = v; onState(v); } };
  const send = (msg) => { try { if (ws?.readyState === 1) ws.send(JSON.stringify({ ...msg, ref: String(++ref) })); } catch { /* reconecta */ } };

  function cleanup() {
    timers.clearInterval(beat); beat = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch { /* já fechado */ } }
    ws = null; setLive(false);
  }
  function scheduleRetry() {
    if (!wanted) return;
    timers.clearTimeout(retry);
    retry = timers.setTimeout(connect, BACKOFF[Math.min(attempt, BACKOFF.length - 1)]);
    attempt += 1;
  }

  async function connect() {
    if (!wanted) return;
    cleanup();
    if (typeof WebSocketImpl !== 'function') { log('tempo real indisponível nesta versão (sem WebSocket)'); return; }
    let token;
    try { token = await getToken(); } catch (error) { log(`tempo real: sem sessão (${error.message})`); scheduleRetry(); return; }
    if (!wanted) return;
    ws = new WebSocketImpl(endpoint);
    ws.onopen = () => {
      joinRef = String(ref + 1);
      send({ topic, event: 'phx_join', join_ref: joinRef, payload: {
        config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false, postgres_changes: TABLES.map((table) => ({ event: '*', schema: 'public', table })) },
        access_token: token
      } });
      beat = timers.setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), heartbeatMs);
    };
    ws.onmessage = (event) => {
      let msg; try { msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)); } catch { return; }
      if (msg.topic !== topic) return;
      if (msg.event === 'phx_reply' && msg.ref === joinRef) {
        if (msg.payload?.status === 'ok') { attempt = 0; setLive(true); } else { log(`tempo real recusado: ${JSON.stringify(msg.payload?.response || {}).slice(0, 200)}`); cleanup(); scheduleRetry(); }
      } else if (msg.event === 'postgres_changes') {
        onChange(msg.payload?.data?.table || msg.payload?.table || '');
      } else if (msg.event === 'system' && msg.payload?.status === 'error') {
        // Ex.: tempo real ainda não ligado no servidor (04-tempo-real.sql). Tenta de novo com calma (a partir de 30 s).
        log(`tempo real: ${String(msg.payload.message || '').slice(0, 200)}`);
        cleanup(); attempt = Math.max(attempt, 3); scheduleRetry();
      } else if (msg.event === 'phx_close' || msg.event === 'phx_error') { cleanup(); scheduleRetry(); }
    };
    ws.onclose = () => { cleanup(); scheduleRetry(); };
    ws.onerror = () => { /* onclose vem em seguida */ };
  }

  return {
    start() { wanted = true; attempt = 0; timers.clearTimeout(retry); connect(); },
    stop() { wanted = false; timers.clearTimeout(retry); cleanup(); },
    /** Token renovado: o servidor precisa saber, senão corta o aviso quando o anterior vence. */
    token(accessToken) { if (live && accessToken) send({ topic, event: 'access_token', payload: { access_token: accessToken } }); },
    get live() { return live; }
  };
}


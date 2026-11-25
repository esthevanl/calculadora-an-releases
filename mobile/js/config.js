// Servidor do escritório (o mesmo do app de computador, electron/config.cjs). A chave "publishable" é pública por
// natureza: quem protege os dados são as regras do banco (RLS). NUNCA colocar aqui a chave service_role.
export const SUPABASE_URL = 'https://ddsaedcraomjuznpnpth.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_r8yQ5R5lZ7iUkJL0VwKzzQ_LQY6GAy2';
export const APP_VERSION = '0.2.0';
// Função do servidor que envia as notificações (supabase/functions/notify).
export const NOTIFY_URL = `${SUPABASE_URL}/functions/v1/notify`;
// "Lembrar de mim": o master fica lembrado; os demais níveis digitam a senha de novo a cada 10 dias (igual ao computador).
export const REMEMBER_DAYS = 10;

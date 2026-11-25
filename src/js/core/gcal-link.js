// Link "Agendar no Google": abre o Google Agenda com o compromisso JÁ PREENCHIDO; a pessoa confere e salva.
// Nada é criado sozinho (regra do escritório: a agenda é sempre um passo manual). Sem DOM: testável em Node.
const pad = (n) => String(n).padStart(2, '0');
const compact = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;

/**
 * @param {{ title: string, date: string (AAAA-MM-DD), time?: string (HH:MM), minutes?: number, details?: string, location?: string, timeZone?: string }} ev
 */
export function googleCalendarUrl({ title, date, time, minutes = 60, details = '', location = '', timeZone = 'America/Porto_Velho' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) throw new Error('Informe a data do compromisso.');
  const day = new Date(`${date}T12:00:00Z`);
  let dates;
  if (/^\d{2}:\d{2}$/.test(String(time || ''))) {
    const [h, m] = time.split(':').map(Number);
    const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m + minutes));
    dates = `${compact(day)}T${pad(h)}${pad(m)}00/${compact(end)}T${pad(end.getUTCHours())}${pad(end.getUTCMinutes())}00`; // horário local (ctz)
  } else {
    const next = new Date(day.getTime() + 864e5);
    dates = `${compact(day)}/${compact(next)}`; // dia inteiro
  }
  const qs = new URLSearchParams({ action: 'TEMPLATE', text: String(title || 'Compromisso'), dates, ctz: timeZone });
  if (details) qs.set('details', String(details).slice(0, 1500));
  if (location) qs.set('location', String(location));
  return `https://calendar.google.com/calendar/render?${qs}`;
}

// Nomes cadastrados com a primeira letra de cada palavra maiúscula ("Juliana Maria Freitas de Assis Holanda").
// Partículas (de, da, do, dos, das, e) ficam minúsculas; siglas de empresa (LTDA, ME, EPP, S/A...) ficam maiúsculas.
// Sem DOM: testável em Node. Cópia CommonJS em electron/names.cjs (mantenha as duas iguais; o teste confere).
const PARTICLES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'della', 'van', 'von', 'y']);
const ACRONYMS = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S/A', 'S.A.', 'MEI', 'SS', 'SLU', 'CIA', 'II', 'III', 'IV', 'OAB']);

export function titleCase(value) {
  const words = String(value ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.map((w, i) => {
    const upper = w.toLocaleUpperCase('pt-BR');
    if (ACRONYMS.has(upper) || ACRONYMS.has(upper.replace(/[.,]$/, ''))) return upper;
    const lower = w.toLocaleLowerCase('pt-BR');
    if (i > 0 && PARTICLES.has(lower)) return lower;
    // Primeira letra de cada parte (também depois de hífen e apóstrofo: "Ana-Clara", "D'Ávila").
    return lower.replace(/(^|[-'’])(\p{L})/gu, (_m, sep, ch) => sep + ch.toLocaleUpperCase('pt-BR'));
  }).join(' ');
}

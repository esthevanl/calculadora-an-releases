// Regras reaproveitadas do app de computador (sem tela, iguais nos dois). O script de publicação copia estes arquivos.
export { escapeHtml, formatBRL, formatDate, stripAccents } from '../../src/js/core/money.js';
export { titleCase } from '../../src/js/core/names.js';
export { teorParts, paragraphHtml } from '../../src/js/process/pub-format.js';
export { chargeMessage, whatsappUrl, phoneDigits, DEFAULT_CHARGE_TEMPLATE } from '../../src/js/finance/charge-message.js';
export { isFutureCharge, PAYMENT_METHODS } from '../../src/js/crm/schema.js';
export { NOTIFY_TYPES, typesFor, effectivePrefs, DEFAULT_MORNING } from '../../src/js/core/notify-types.js';
export { googleCalendarUrl } from '../../src/js/core/gcal-link.js';

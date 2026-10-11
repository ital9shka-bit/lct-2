export class AppError extends Error {
  constructor(status, code, message, fields = {}) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
export function fail(status, code, message, fields) { throw new AppError(status, code, message, fields); }
export function checkRevision(row, revision) { if (row.revision !== revision) fail(409, 'revision_conflict', 'Данные изменились. Обновите страницу перед повторным сохранением.'); }
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

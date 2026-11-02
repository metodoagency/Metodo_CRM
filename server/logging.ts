import pino, { type DestinationStream } from 'pino';
export const logRedactions = ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-csrf-token"]', 'email', 'phone', 'birthDate', 'healthNotes', 'injuryNotes', 'guardian', 'salary', 'salaryAmount', 'bonuses', 'commissionTerms', '*.email', '*.phone', '*.birthDate', '*.healthNotes', '*.injuryNotes', '*.guardian', '*.salary', '*.salaryAmount', '*.bonuses', '*.commissionTerms', 'req.body', 'res.headers["set-cookie"]'];
export const loggerOptions = {
  level: process.env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: { paths: logRedactions, censor: '***' },
  serializers: { req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.split('?')[0] }) },
};
export function createLogger(stream?: DestinationStream) { return stream ? pino({ ...loggerOptions, level: 'info' }, stream) : pino(loggerOptions); }

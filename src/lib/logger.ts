import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.privateKey',
      '*.idToken',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'colibriplus-next',
  },
});

import type { ErrorEvent } from '@sentry/nestjs';
import { scrubEvent, sentryOptions } from './sentry.js';

describe('sentryOptions', () => {
  it('sin DSN, Sentry queda apagado', () => {
    expect(sentryOptions({ NODE_ENV: 'production' })).toBeNull();
  });

  it('con DSN, sin datos personales y atado al deploy', () => {
    expect(
      sentryOptions({
        SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/1',
        NODE_ENV: 'production',
        SOURCE_COMMIT: 'a1b2c3',
      }),
    ).toMatchObject({
      environment: 'production',
      release: 'a1b2c3',
      tracesSampleRate: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        urlQueryParams: false,
        stackFrameVariables: false,
      },
    });
  });
});

describe('scrubEvent', () => {
  it('saca cookies, body, query y cabeceras sensibles del request', () => {
    const event = {
      type: undefined,
      request: {
        url: 'https://api.clubsy.app/panel/customers?query=1123456789',
        query_string: 'query=1123456789',
        cookies: { fs_staff: 'secreto' },
        data: { phone: '+5491123456789', code: '123456' },
        headers: {
          Cookie: 'fs_staff=secreto',
          authorization: 'Bearer x',
          'user-agent': 'Chrome',
        },
      },
    } as ErrorEvent;

    expect(scrubEvent(event).request).toEqual({
      url: 'https://api.clubsy.app/panel/customers',
      headers: { 'user-agent': 'Chrome' },
    });
  });

  it('un evento sin request queda igual', () => {
    const event = { type: undefined, message: 'x' } as ErrorEvent;
    expect(scrubEvent(event)).toEqual(event);
  });
});

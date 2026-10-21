import { AppException } from '../../../common/errors/app.exception.js';
import {
  toWhatsAppNumber,
  WhatsAppOtpSender,
  type WhatsAppConfig,
} from './whatsapp-otp-sender.js';

const config: WhatsAppConfig = {
  phoneNumberId: '1234567890',
  accessToken: 'token-secreto',
  templateName: 'clubsy_codigo',
  templateLanguage: 'es_AR',
};
const PHONE = '+5491123456789';
const CODE = '482913';

describe('WhatsAppOtpSender', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sender = new WhatsAppOtpSender(config);

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(Response.json(body, { status }));
  const sendError = async () => {
    const error = await sender.send(PHONE, CODE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  };

  it('manda la plantilla con el código al número sin el 9', async () => {
    respond(200, { messages: [{ id: 'wamid.1' }] });

    await sender.send(PHONE, CODE);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v25.0/1234567890/messages');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer token-secreto',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '541123456789',
      type: 'template',
      template: {
        name: 'clubsy_codigo',
        language: { code: 'es_AR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: CODE }] },
          {
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: CODE }],
          },
        ],
      },
    });
  });

  it('si Meta rechaza el envío, falla con OTP_DELIVERY_FAILED y su código de error', async () => {
    respond(401, { error: { code: 190, message: `token vencido ${PHONE}` } });

    const error = await sendError();

    expect(error.code).toBe('OTP_DELIVERY_FAILED');
    expect(error.cause).toEqual(
      new Error('WhatsApp respondió 401 (código 190)'),
    );
  });

  it('si Meta no responde, falla igual', async () => {
    fetchMock.mockRejectedValue(new DOMException('', 'TimeoutError'));

    const error = await sendError();

    expect(error.cause).toEqual(
      new Error('WhatsApp no respondió (TimeoutError)'),
    );
  });

  it('el error no lleva el teléfono, el código ni el token', async () => {
    respond(400, 'no es JSON');

    const error = await sendError();

    const text = `${error.message} ${String(error.cause)} ${JSON.stringify(error.getResponse())}`;
    for (const secret of [PHONE, '1123456789', CODE, config.accessToken]) {
      expect(text).not.toContain(secret);
    }
    expect(error.cause).toEqual(
      new Error('WhatsApp respondió 400 (código desconocido)'),
    );
  });
});

describe('toWhatsAppNumber', () => {
  it('le saca el + y el 9 de celular al número argentino', () => {
    expect(toWhatsAppNumber('+5491123456789')).toBe('541123456789');
    expect(toWhatsAppNumber('+5493511234567')).toBe('543511234567');
  });
});

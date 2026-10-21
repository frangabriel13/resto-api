import { ResendEmailSender } from './resend-email-sender.js';

const message = {
  to: 'duena@cafe.com',
  subject: 'Restablecé tu contraseña de Clubsy',
  text: 'Link: https://clubsy.test/panel/restablecer?token=abc',
};

describe('ResendEmailSender', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sender = new ResendEmailSender({
    apiKey: 're_secreta',
    from: 'Clubsy <no-reply@clubsy.test>',
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(Response.json(body, { status }));

  it('manda el mail con el remitente configurado', async () => {
    respond(200, { id: 'email-1' });

    await sender.send(message);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer re_secreta' });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: 'Clubsy <no-reply@clubsy.test>',
      ...message,
    });
  });

  it('si Resend rechaza el envío, el error lleva solo el estado y el tipo', async () => {
    respond(403, {
      statusCode: 403,
      name: 'validation_error',
      message: 'You can only send testing emails to duena@cafe.com',
    });

    const error = await sender.send(message).catch((e: unknown) => e);

    expect(error).toEqual(new Error('Resend respondió 403 (validation_error)'));
  });

  it('si Resend no responde, el error no lleva datos del mail', async () => {
    fetchMock.mockRejectedValue(new DOMException('', 'TimeoutError'));

    const error = await sender.send(message).catch((e: unknown) => e);

    expect(error).toEqual(new Error('Resend no respondió (TimeoutError)'));
  });
});

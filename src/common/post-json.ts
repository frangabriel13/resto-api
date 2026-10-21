const TIMEOUT_MS = 10_000;

// Para los proveedores externos (WhatsApp, mails). Si no responde, el error
// nombra solo al servicio y el tipo de falla: nunca datos del pedido.
export function postJson(
  service: string,
  url: string,
  token: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    const kind = error instanceof Error ? error.name : 'desconocido';
    throw new Error(`${service} no respondió (${kind})`);
  });
}

export async function errorBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

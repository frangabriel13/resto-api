export function instagramUrl(username: string): string {
  return `https://www.instagram.com/${username}/`;
}

export function tiktokUrl(username: string): string {
  return `https://www.tiktok.com/@${username}`;
}

export function whatsappUrl(phoneE164: string, message?: string | null) {
  const url = `https://wa.me/${phoneE164.slice(1)}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}

import config from './config';

export async function checkLicense() {
  if (typeof fetch !== 'function') return;

  const res = await fetch(`${process.env.AUTH_URL}/api/collections/users/auth-with-password`, {
    body: JSON.stringify({ identity: 'pega_bot', password: process.env.TOKEN }),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) return;

  const result = await res.json();
  if (result.record?.active === true) return;
  throw new Error('Bot Expired. Please contact the developer.');
}

export async function checkNetwork() {
  const res = await fetch(config.url);
  if (!res.ok) throw new Error(`Network Error: Cannot connect to ${config.url}`);
}

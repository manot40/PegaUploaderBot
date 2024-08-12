import kleur from 'kleur';

import config from './config';

export async function checkLicense() {
  if (typeof fetch !== 'function') return;

  const res = await fetch(`${process.env.AUTH_URL}/api/collections/users/auth-with-password`, {
    body: JSON.stringify({ identity: 'pega_bot', password: process.env.TOKEN }),
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await res.json().catch(() => null);
  console.log(kleur.green(result?.record.name || config.jobName));
  console.log(`\n Ver: ${result?.record.additional || 'unknown version'} \n`);

  if (!result) return;

  if (result.record.active === true) return;
  throw new Error('Bot Expired. Please contact the developer.');
}

export async function checkNetwork() {
  let counter = 0;
  const aborter = new AbortController();
  const timer = setInterval(() => ++counter === 5 && aborter.abort(), 1000);

  const response = await fetch(config.url, { signal: aborter.signal })
    .catch(() => null)
    .finally(() => clearInterval(timer));

  if (response === null) {
    kleur.yellow(`NetWarn: Connection timed out after ${counter} seconds. Retrying...`);
    return await checkNetwork();
  } else if (!response.ok) {
    kleur.red(`NetError: Failed when trying connection to ${config.url}`);
    await new Promise((r) => setTimeout(r, 10000));
    process.exit(1);
  }
}

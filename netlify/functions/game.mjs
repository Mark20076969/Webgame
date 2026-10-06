// Netlify Function: fiók létrehozása / belépés / mentés (Netlify Blobs tárolóba)
import { getStore } from '@netlify/blobs';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
const hash = (pw, saltHex) => scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
const passOk = (user, pw) => {
  const h = hash(pw, user.salt), s = Buffer.from(user.hash, 'hex');
  return h.length === s.length && timingSafeEqual(h, s);
};

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Csak POST kérés megengedett' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Hibás kérés' }, 400); }

  const name = String(b.name || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (!/^[a-z0-9_-]{2,20}$/.test(name))
    return json({ error: 'A név 2–20 karakter: ékezet nélküli betű, szám, _ vagy -' }, 400);
  if (password.length < 6 || password.length > 100)
    return json({ error: 'A jelszó legalább 6 karakter legyen' }, 400);

  const store = getStore({ name: 'users', consistency: 'strong' });
  const user = await store.get(name, { type: 'json' });

  if (b.action === 'load') {
    if (!user) {                                   // ismeretlen név -> új fiók
      const salt = randomBytes(16).toString('hex');
      await store.setJSON(name, { salt, hash: hash(password, salt).toString('hex'), save: null, created: Date.now() });
      return json({ ok: true, created: true, save: null });
    }
    if (!passOk(user, password)) return json({ error: 'Rossz jelszó' }, 401);
    return json({ ok: true, created: false, save: user.save });
  }

  if (b.action === 'save') {
    if (!user || !passOk(user, password)) return json({ error: 'Hitelesítés sikertelen' }, 401);
    if (JSON.stringify(b.save ?? null).length > 300000) return json({ error: 'Túl nagy mentés' }, 413);
    user.save = b.save; user.updated = Date.now();
    await store.setJSON(name, user);
    return json({ ok: true });
  }
  return json({ error: 'Ismeretlen művelet' }, 400);
};

export const config = { path: '/api/game' };

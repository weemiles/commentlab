import { createHmac, randomBytes } from 'node:crypto';
export function createPrivateCache({ ttl = 600000, maxBytes = 16000000, now = Date.now } = {}) {
  const salt = randomBytes(32), entries = new Map();
  let bytes = 0;
  const remove = key => { bytes -= entries.get(key)?.bytes || 0; entries.delete(key); };
  const key = (credential, parameters) => credential ? createHmac('sha256', salt).update(JSON.stringify([credential, parameters])).digest('hex') : null;
  return {
    key,
    get(id) {
      if (!id) return null;
      for (const [k,v] of entries) if (v.expires <= now()) remove(k);
      const entry = entries.get(id);
      return entry ? JSON.parse(entry.value) : null;
    },
    set(id, result) {
      if (!id || result.truncated || result.sentimentEngine !== 'jev') return;
      const value = JSON.stringify(result), size = Buffer.byteLength(value);
      if (size > maxBytes) return;
      remove(id);
      for (const [k,v] of entries) if (v.expires <= now()) remove(k);
      while (entries.size && bytes + size > maxBytes) remove(entries.keys().next().value);
      entries.set(id, { value, bytes: size, expires: now()+ttl }); bytes += size;
    }
  };
}

// Keep long-running alert sessions from retaining every semantic vector or locality ever seen.
export class LruCache extends Map {
  constructor(maxEntries) {
    super();
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('La caché necesita un límite positivo.');
    this.maxEntries = maxEntries;
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    super.delete(key);
    super.set(key, value);
    if (this.size > this.maxEntries) super.delete(this.keys().next().value);
    return this;
  }
}

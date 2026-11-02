// Upload history kept on the student's own device (IndexedDB).

const Store = (() => {
  const DB = 'workit', STORE = 'submissions';
  let dbPromise;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        };
        req.onsuccess = () => {
          const d = req.result;
          // Safari drops the connection when the app sits in the background; open a fresh one next time.
          d.onclose = () => { dbPromise = null; };
          d.onversionchange = () => { d.close(); dbPromise = null; };
          resolve(d);
        };
        req.onerror = () => { dbPromise = null; reject(req.error); };
      });
    }
    return dbPromise;
  }

  function once(d, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode); // throws if the connection was lost
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Saving on this device was stopped.'));
    });
  }

  // One retry with a fresh connection covers Safari's "connection lost" errors.
  async function tx(mode, fn) {
    try {
      return await once(await db(), mode, fn);
    } catch (err) {
      dbPromise = null;
      return once(await db(), mode, fn);
    }
  }

  const put = (item) => tx('readwrite', s => s.put(item));
  const get = (id) => tx('readonly', s => s.get(id));
  const remove = (id) => tx('readwrite', s => s.delete(id));
  const all = async () => {
    const items = await tx('readonly', s => s.getAll());
    return items.sort((a, b) => b.createdAt - a.createdAt);
  };
  async function update(id, changes) {
    const item = await get(id);
    if (!item) return null;
    Object.assign(item, changes);
    await put(item);
    return item;
  }

  return { put, get, remove, all, update };
})();

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
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const result = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
    });
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

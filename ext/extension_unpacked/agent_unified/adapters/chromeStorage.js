const RUNTIME_ERROR_PREFIX = "[agent/storage]";

function resolveStorageArea(area = "local") {
  if (typeof chrome === "undefined" || !chrome.storage) {
    throw new Error(`${RUNTIME_ERROR_PREFIX} chrome.storage is not available in this context.`);
  }

  if (typeof area === "string") {
    const storageArea = chrome.storage[area];
    if (!storageArea) {
      throw new Error(`${RUNTIME_ERROR_PREFIX} Unknown chrome.storage area: ${area}`);
    }

    return storageArea;
  }

  return area;
}

function withCallback(fn, ...args) {
  return new Promise((resolve, reject) => {
    try {
      fn(...args, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(new Error(`${RUNTIME_ERROR_PREFIX} ${err.message}`));
          return;
        }

        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function storageGet(area, keys = null) {
  const storageArea = resolveStorageArea(area);
  const result = await withCallback(storageArea.get.bind(storageArea), keys);

  if (keys === null) {
    return result;
  }

  if (Array.isArray(keys)) {
    return result;
  }

  return result?.[keys];
}

async function storageSet(area, items) {
  const storageArea = resolveStorageArea(area);
  await withCallback(storageArea.set.bind(storageArea), items);
}

async function storageRemove(area, keys) {
  const storageArea = resolveStorageArea(area);
  await withCallback(storageArea.remove.bind(storageArea), keys);
}

async function storageClear(area) {
  const storageArea = resolveStorageArea(area);
  await withCallback(storageArea.clear.bind(storageArea));
}

export {
  resolveStorageArea,
  storageGet,
  storageSet,
  storageRemove,
  storageClear,
};

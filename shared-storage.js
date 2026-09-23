(function () {
  const STORAGE_KEY = 'pharmacy_app_v1';
  const CONFIG_KEY = 'pharmacy_firebase_config';
  let databaseRef = null;
  let firebaseDb = null;

  function getFirebaseConfig() {
    const source = window.PHARMACY_FIREBASE_CONFIG || localStorage.getItem(CONFIG_KEY);
    if (!source) return null;

    try {
      const config = typeof source === 'string' ? JSON.parse(source) : source;
      if (!config || !config.databaseURL) return null;
      return config;
    } catch (error) {
      console.warn('Invalid Firebase configuration:', error);
      return null;
    }
  }

  function ensureDatabase() {
    const config = getFirebaseConfig();
    if (!config || !window.firebase) return null;

    try {
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(config);
      }
      if (!firebaseDb) {
        firebaseDb = window.firebase.database();
      }
      return firebaseDb;
    } catch (error) {
      console.warn('Unable to initialize Firebase:', error);
      return null;
    }
  }

  function readLocalState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      console.warn('Unable to read local state:', error);
      return null;
    }
  }

  function writeLocalState(value) {
    if (!value || typeof value !== 'object') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }

  function saveState(value) {
    if (!value || typeof value !== 'object') {
      return Promise.resolve(null);
    }

    writeLocalState(value);
    const db = ensureDatabase();
    if (!db) return Promise.resolve(value);

    return db.ref(STORAGE_KEY).set(value).catch(error => {
      console.warn('Firebase save failed:', error);
      return null;
    });
  }

  function readRemoteState() {
    const db = ensureDatabase();
    if (!db) {
      return Promise.resolve(readLocalState());
    }

    return db.ref(STORAGE_KEY).once('value').then(snapshot => {
      const value = snapshot.val();
      const next = value && typeof value === 'object' ? value : readLocalState();
      if (next) writeLocalState(next);
      return next;
    }).catch(() => readLocalState());
  }

  function bindSync(onStateChange) {
    const db = ensureDatabase();
    if (!db || typeof onStateChange !== 'function') {
      return null;
    }

    if (databaseRef) {
      databaseRef.off('value');
    }

    databaseRef = db.ref(STORAGE_KEY);
    databaseRef.on('value', snapshot => {
      const next = snapshot.val();
      if (!next || typeof next !== 'object') return;
      writeLocalState(next);
      onStateChange(next);
    });

    return databaseRef;
  }

  window.pharmacyStorage = {
    STORAGE_KEY,
    CONFIG_KEY,
    setConfig(config) {
      if (!config || typeof config !== 'object') return;
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    },
    readLocalState,
    writeLocalState,
    saveState,
    readRemoteState,
    bindSync
  };
})();

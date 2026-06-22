(function () {
  const cfg = window.FIREBASE_CONFIG;

  if (!cfg || !cfg.apiKey) {
    console.log("Firebase ej aktiverat – lokalt läge");
    return;
  }

  firebase.initializeApp(cfg);

  const auth = firebase.auth();
  const db = firebase.firestore();

  // =========================
  // 🔐 AUTH (login/registrera)
  // =========================
  window.FirebaseAuth = {
    register: async (email, password, username) => {
      const userCred = await auth.createUserWithEmailAndPassword(email, password);

      await db.collection("users").doc(userCred.user.uid).set({
        username,
        savedWords: [],
        createdAt: Date.now()
      });

      return userCred.user;
    },

    login: (email, password) => {
      return auth.signInWithEmailAndPassword(email, password);
    },

    logout: () => auth.signOut(),

    getUser: () => auth.currentUser
  };

  // =========================
  // ☁️ SYNC (sparade ord)
  // =========================
  window.FirebaseSync = {
    saveWord: async (word) => {
      const user = auth.currentUser;
      if (!user) return;

      const ref = db.collection("users").doc(user.uid);

      await ref.set({
        savedWords: firebase.firestore.FieldValue.arrayUnion(word)
      }, { merge: true });
    },

    removeWord: async (word) => {
      const user = auth.currentUser;
      if (!user) return;

      const ref = db.collection("users").doc(user.uid);

      await ref.set({
        savedWords: firebase.firestore.FieldValue.arrayRemove(word)
      }, { merge: true });
    },

    loadWords: async () => {
      const user = auth.currentUser;
      if (!user) return [];

      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();

      return snap.exists ? (snap.data().savedWords || []) : [];
    },

    // Skriv hela listan (saekraste saettet att haalla enheter i synk).
    setWords: async (words) => {
      const user = auth.currentUser;
      if (!user) return;
      const ref = db.collection("users").doc(user.uid);
      await ref.set({ savedWords: Array.from(new Set(words || [])) }, { merge: true });
    },

    // Lyssna paa foeraendringar i realtid (ord sparat paa en annan enhet).
    subscribe: (cb) => {
      const user = auth.currentUser;
      if (!user) return () => {};
      const ref = db.collection("users").doc(user.uid);
      return ref.onSnapshot((snap) => {
        if (snap.exists) cb(snap.data().savedWords || []);
      });
    },

    // --- NYTT: Profil, inställningar och egna ord ---
    setProfileData: async (data) => {
      const user = auth.currentUser;
      if (!user) return;
      const ref = db.collection("users").doc(user.uid);
      await ref.set({ profile: data }, { merge: true });
    },

    loadProfileData: async () => {
      const user = auth.currentUser;
      if (!user) return {};
      const ref = db.collection("users").doc(user.uid);
      const snap = await ref.get();
      return snap.exists ? (snap.data().profile || {}) : {};
    },

    subscribeProfile: (cb) => {
      const user = auth.currentUser;
      if (!user) return () => {};
      const ref = db.collection("users").doc(user.uid);
      let init = true;
      return ref.onSnapshot((snap) => {
        if (snap.exists) {
           cb(snap.data().profile || {}, init);
           init = false;
        }
      });
    }
  };
})();
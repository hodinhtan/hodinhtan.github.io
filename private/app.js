import { firebaseConfig } from './firebase-config.js';
import { $, getPref, setPref } from './ui.js';
import { views } from './views.js';
import { disconnectCalendar } from './calendar.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const STATES = ['loading', 'config', 'login', 'denied', 'app'];
const COLLECTIONS = ['notes', 'tasks', 'links', 'feed'];

function show(name) {
  for (const s of STATES) $(`state-${s}`).hidden = s !== name;
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  show('config');
} else {
  start().catch((e) => {
    show('login');
    $('login-err').textContent = 'Không tải được Firebase: ' + e.message;
  });
}

async function start() {
  const [{ initializeApp }, fa, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = fa.getAuth(app);
  const db = fs.getFirestore(app);

  const store = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  const ctx = {
    fa, fs, db, auth, store,
    user: null,
    area: getPref('dash_area', 'all'),
    q: '',
    showDone: false,
    rerender: render,
    fail(e) {
      $('app-err').textContent = 'Lỗi: ' + (e.code || e.message);
      clearTimeout(ctx.failTimer);
      ctx.failTimer = setTimeout(() => ($('app-err').textContent = ''), 8000);
    },
    save(col, id, data) {
      const payload = { ...data, updatedAt: fs.serverTimestamp() };
      return id ? fs.setDoc(fs.doc(db, col, id), payload) : fs.addDoc(fs.collection(db, col), payload);
    },
    remove: (col, id) => fs.deleteDoc(fs.doc(db, col, id)),
  };

  let unsubscribes = [];
  let status = {};

  function resubscribe(user) {
    unsubscribes.forEach((u) => u());
    status = Object.fromEntries(COLLECTIONS.map((c) => [c, 'pending']));
    for (const c of COLLECTIONS) store[c] = [];
    unsubscribes = [];
    if (!user) return;
    for (const name of COLLECTIONS) {
      const ref = fs.collection(db, name);
      const q = name === 'feed' ? fs.query(ref, fs.orderBy('ts', 'desc'), fs.limit(200)) : ref;
      unsubscribes.push(
        fs.onSnapshot(
          q,
          (snap) => {
            store[name] = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
            status[name] = 'ok';
            settle();
          },
          (err) => {
            store[name] = [];
            status[name] = err.code === 'permission-denied' ? 'denied' : 'error:' + (err.code || err.message);
            settle();
          },
        ),
      );
    }
  }

  function settle() {
    const values = Object.values(status);
    if (values.includes('pending')) return;
    if (values.every((s) => s === 'denied')) {
      $('denied-email').textContent = ctx.user?.email ?? '';
      show('denied');
      return;
    }
    const denied = COLLECTIONS.filter((c) => status[c] === 'denied');
    const failed = COLLECTIONS.filter((c) => status[c].startsWith('error:'));
    const warning = [
      denied.length && `Firestore Rules chưa cho phép đọc: ${denied.join(', ')}. Hãy dán lại nội dung mới của _firebase/firestore.rules rồi Publish.`,
      failed.length && `Lỗi tải: ${failed.map((c) => `${c} (${status[c].slice(6)})`).join(', ')}.`,
    ]
      .filter(Boolean)
      .join(' ');
    $('app-warn').textContent = warning;
    $('app-warn').hidden = !warning;
    show('app');
    render();
  }

  function render() {
    const hash = location.hash.replace(/^#\/?/, '');
    const name = views[hash] ? hash : 'overview';
    for (const a of document.querySelectorAll('#tabs a')) {
      if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    for (const b of document.querySelectorAll('#area-seg button')) {
      b.setAttribute('aria-pressed', String(b.dataset.area === ctx.area));
    }
    const active = document.activeElement;
    const keep = active?.id && active.closest('#view') ? { id: active.id, value: active.value } : null;
    $('view').replaceChildren(views[name](ctx));
    if (keep) {
      const node = document.getElementById(keep.id);
      if (node) {
        node.value = keep.value;
        node.focus();
      }
    }
  }

  fa.onAuthStateChanged(auth, (user) => {
    ctx.user = user;
    $('app-warn').textContent = '';
    $('app-warn').hidden = true;
    $('app-err').textContent = '';
    resubscribe(user);
    if (!user) {
      disconnectCalendar();
      $('view').replaceChildren();
      show('login');
      return;
    }
    $('user-email').textContent = user.email;
    $('user-photo').hidden = !user.photoURL;
    if (user.photoURL) $('user-photo').src = user.photoURL;
    show('loading');
  });

  $('login-btn').addEventListener('click', async () => {
    $('login-err').textContent = '';
    const provider = new fa.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await fa.signInWithPopup(auth, provider);
    } catch (e) {
      const messages = {
        'auth/popup-closed-by-user': '',
        'auth/cancelled-popup-request': '',
        'auth/popup-blocked': 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép popup rồi thử lại.',
        'auth/unauthorized-domain': 'Tên miền này chưa được thêm vào Authorized domains trong Firebase.',
      };
      $('login-err').textContent = messages[e.code] ?? 'Đăng nhập thất bại: ' + (e.code || e.message);
    }
  });

  const logout = () => fa.signOut(auth);
  $('logout-btn').addEventListener('click', logout);
  $('denied-logout').addEventListener('click', logout);

  $('search').addEventListener('input', (e) => {
    ctx.q = e.target.value.trim().toLowerCase();
    render();
  });
  $('area-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-area]');
    if (!b) return;
    ctx.area = b.dataset.area;
    setPref('dash_area', ctx.area);
    render();
  });
  window.addEventListener('hashchange', () => {
    window.scrollTo(0, 0);
    render();
  });
}

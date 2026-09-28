import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const $ = (id) => document.getElementById(id);
const STATES = ['loading', 'config', 'login', 'denied', 'app'];

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
  const notesCol = fs.collection(db, 'notes');

  let notes = [];
  let unsubscribe = null;
  let editingId = null;
  let editorSnapshot = '';

  fa.onAuthStateChanged(auth, (user) => {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    notes = [];
    render();
    $('app-err').textContent = '';

    if (!user) {
      show('login');
      return;
    }
    $('user-email').textContent = user.email;
    $('user-photo').hidden = !user.photoURL;
    if (user.photoURL) $('user-photo').src = user.photoURL;
    show('loading');

    const q = fs.query(notesCol, fs.orderBy('updatedAt', 'desc'));
    unsubscribe = fs.onSnapshot(
      q,
      (snap) => {
        notes = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
        show('app');
        render();
      },
      (err) => {
        if (err.code === 'permission-denied') {
          $('denied-email').textContent = user.email;
          show('denied');
        } else {
          show('app');
          $('app-err').textContent = 'Lỗi tải dữ liệu: ' + err.message;
        }
      },
    );
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

  $('search').addEventListener('input', render);
  $('new-btn').addEventListener('click', () => openEditor(null));

  function render() {
    const q = $('search').value.trim().toLowerCase();
    const list = q
      ? notes.filter((n) => `${n.title}\n${n.body}`.toLowerCase().includes(q))
      : notes;
    $('notes').replaceChildren(...list.map(noteElement));
    $('empty').hidden = list.length > 0;
    $('empty').textContent = notes.length
      ? 'Không tìm thấy kết quả.'
      : 'Chưa có thông tin nào. Bấm “+ Thêm” để tạo.';
  }

  function noteElement(n) {
    const el = document.createElement('article');
    el.className = 'card note';

    const head = document.createElement('div');
    head.className = 'note-head';
    const title = document.createElement('h2');
    title.textContent = n.title;
    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const copyBtn = button('Sao chép', async () => {
      try {
        await navigator.clipboard.writeText(n.body);
        copyBtn.textContent = 'Đã chép';
      } catch {
        copyBtn.textContent = 'Lỗi';
      }
      setTimeout(() => (copyBtn.textContent = 'Sao chép'), 1500);
    });
    actions.append(copyBtn, button('Sửa', () => openEditor(n)));
    head.append(title, actions);

    const body = document.createElement('p');
    body.className = 'note-body';
    body.append(...linkify(n.body));

    const time = document.createElement('div');
    time.className = 'note-time';
    const date = n.updatedAt?.toDate?.();
    time.textContent = date ? 'Cập nhật ' + date.toLocaleString('vi-VN') : '';

    el.append(head, body, time);
    return el;
  }

  function button(label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function linkify(text) {
    return text.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
      if (i % 2 === 0) return document.createTextNode(part);
      const a = document.createElement('a');
      a.href = part;
      a.textContent = part;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return a;
    });
  }

  const editor = $('editor');

  function editorState() {
    return $('ed-title').value + '\u0000' + $('ed-body').value;
  }

  function openEditor(note) {
    editingId = note?.id ?? null;
    $('ed-title').value = note?.title ?? '';
    $('ed-body').value = note?.body ?? '';
    $('ed-delete').hidden = !note;
    $('ed-err').hidden = true;
    editorSnapshot = editorState();
    editor.showModal();
    $(note ? 'ed-body' : 'ed-title').focus();
  }

  function closeEditor() {
    if (editorState() !== editorSnapshot && !confirm('Bỏ các thay đổi chưa lưu?')) return;
    editor.close();
  }

  $('ed-cancel').addEventListener('click', closeEditor);
  editor.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeEditor();
  });

  async function withBusy(action) {
    const buttons = editor.querySelectorAll('button');
    buttons.forEach((b) => (b.disabled = true));
    $('ed-err').hidden = true;
    try {
      await action();
      editor.close();
    } catch (e) {
      $('ed-err').textContent = 'Lỗi: ' + (e.code || e.message);
      $('ed-err').hidden = false;
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  $('editor-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      title: $('ed-title').value.trim(),
      body: $('ed-body').value,
      updatedAt: fs.serverTimestamp(),
    };
    withBusy(() =>
      editingId ? fs.setDoc(fs.doc(notesCol, editingId), data) : fs.addDoc(notesCol, data),
    );
  });

  $('ed-delete').addEventListener('click', () => {
    if (!confirm(`Xoá “${$('ed-title').value}”?`)) return;
    withBusy(() => fs.deleteDoc(fs.doc(notesCol, editingId)));
  });
}

const DB = 'safesign_users';
const SESS = 'safesign_session';
function getUsers() { try { return JSON.parse(localStorage.getItem(DB) || '{}'); } catch { return {}; } }
function saveUsers(u) { localStorage.setItem(DB, JSON.stringify(u)); }

// auto-redirect if already logged in
const existing = sessionStorage.getItem(SESS);
if (existing && getUsers()[existing]) window.location.href = 'dashboard.html';

function switchTab(tab) {
  const login = tab === 'login';
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', login ? i === 0 : i === 1));
  document.getElementById('loginSection').classList.toggle('active', login);
  document.getElementById('registerSection').classList.toggle('active', !login);
  document.getElementById('formTitle').textContent = login ? 'Bem-vindo de volta' : 'Criar nova conta';
  document.getElementById('formSub').textContent = login ? 'Aceda à sua conta SafeSign' : 'Registe-se gratuitamente';
}

function showErr(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.style.display = 'block'; }
function hideErr(id) { document.getElementById(id).style.display = 'none'; }

async function doLogin() {
  hideErr('loginError');
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;

  if (!email || !pass) { showErr('loginError', 'Preencha todos os campos.'); return; }

  try {
    const response = await fetch('https://localhost:5000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pass })
    });

    const data = await response.json();

    if (response.ok) {
      const users = getUsers();
      users[email] = users[email] || { name: data.user?.name || email, documents: [] };
      saveUsers(users);
      sessionStorage.setItem(SESS, email);
      window.location.href = 'dashboard.html';
    } else {
      showErr('loginError', data.error);
    }
  } catch (error) {
    showErr('loginError', 'Erro ao ligar ao servidor.');
  }
}

async function doRegister() {
  hideErr('regError');
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;

  if (!name || !email || !pass) { showErr('regError', 'Preencha todos os campos.'); return; }
  if (pass.length < 6) { showErr('regError', 'Password deve ter pelo menos 6 caracteres.'); return; }

  try {
    // Chamada à API (Interação bidirecional via POST)
    const response = await fetch('https://localhost:5000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password: pass })
    });

    const data = await response.json();

    if (response.ok) {
      const users = getUsers();
      users[email] = { name, documents: [] };
      saveUsers(users);
      sessionStorage.setItem(SESS, email);
      window.location.href = 'dashboard.html';
    } else {
      showErr('regError', data.error);
    }
  } catch (error) {
    showErr('regError', 'Erro ao ligar ao servidor. Verifica o Docker.');
  }
}

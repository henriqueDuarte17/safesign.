    const DB   = 'safesign_users';
    const SESS = 'safesign_session';
    function getUsers()    { try { return JSON.parse(localStorage.getItem(DB)||'{}'); } catch { return {}; } }
    function saveUsers(u)  { localStorage.setItem(DB, JSON.stringify(u)); }

    // auto-redirect if already logged in
    const existing = sessionStorage.getItem(SESS);
    if (existing && getUsers()[existing]) window.location.href = 'dashboard.html';

    function switchTab(tab) {
      const login = tab === 'login';
      document.querySelectorAll('.tab').forEach((b,i) => b.classList.toggle('active', login ? i===0 : i===1));
      document.getElementById('loginSection').classList.toggle('active', login);
      document.getElementById('registerSection').classList.toggle('active', !login);
      document.getElementById('formTitle').textContent = login ? 'Bem-vindo de volta' : 'Criar nova conta';
      document.getElementById('formSub').textContent   = login ? 'Aceda à sua conta SafeSign' : 'Registe-se gratuitamente';
    }

    function showErr(id, msg) { const e = document.getElementById(id); e.textContent = msg; e.style.display = 'block'; }
    function hideErr(id)      { document.getElementById(id).style.display = 'none'; }

    function doLogin() {
      hideErr('loginError');
      const email = document.getElementById('loginEmail').value.trim();
      const pass  = document.getElementById('loginPass').value;
      if (!email || !pass) { showErr('loginError','Preencha todos os campos.'); return; }
      const users = getUsers();
      if (!users[email] || users[email].password !== pass) { showErr('loginError','Email ou password incorretos.'); return; }
      sessionStorage.setItem(SESS, email);
      window.location.href = 'dashboard.html';
    }

    function doRegister() {
      hideErr('regError');
      const name  = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass  = document.getElementById('regPass').value;
      if (!name || !email || !pass) { showErr('regError','Preencha todos os campos.'); return; }
      if (pass.length < 6) { showErr('regError','Password deve ter pelo menos 6 caracteres.'); return; }
      const users = getUsers();
      if (users[email]) { showErr('regError','Este email já está registado.'); return; }
      users[email] = { name, password: pass, documents: [] };
      saveUsers(users);
      sessionStorage.setItem(SESS, email);
      window.location.href = 'dashboard.html';
    }

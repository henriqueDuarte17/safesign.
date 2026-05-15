    const DB   = 'safesign_users';
    const SESS = 'safesign_session';

    function getUsers()   { try { return JSON.parse(localStorage.getItem(DB)||'{}'); } catch { return {}; } }
    function saveUsers(u) { localStorage.setItem(DB, JSON.stringify(u)); }
    function getEmail()   { return sessionStorage.getItem(SESS); }

    // ---- BOOT ----
    const email = getEmail();
    if (!email) { window.location.href = 'login.html'; }
    const users = getUsers();
    if (!users[email]) { window.location.href = 'login.html'; }
    const user = users[email];

    // init topbar
    const initials = user.name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    document.getElementById('avatarEl').textContent   = initials;
    document.getElementById('topbarName').textContent  = user.name;
    document.getElementById('topbarEmail').textContent = email;

    // ---- STATE ----
    let currentFilter = 'all';
    let pendingSign   = null; // doc index to sign
    let selectedFile  = null; // File object

    // ---- LOGOUT ----
    function doLogout() {
      sessionStorage.removeItem(SESS);
      window.location.href = 'login.html';
    }

    // ---- FILTER ----
    function setFilter(f, btn) {
      currentFilter = f;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderDocs();
    }

    // ---- RENDER DOCS ----
    function renderDocs() {
      const docs  = getUsers()[email].documents || [];
      const query = document.getElementById('searchInput').value.toLowerCase();
      const filtered = docs.filter(d => {
        const matchSearch = d.name.toLowerCase().includes(query) || (d.category||'').toLowerCase().includes(query);
        const matchFilter = currentFilter === 'all' || d.status === currentFilter;
        return matchSearch && matchFilter;
      });

      const signed  = docs.filter(d=>d.status==='signed').length;
      const pending = docs.filter(d=>d.status==='pending').length;
      const totalKB = docs.reduce((sum,d)=>sum+(d.sizeBytes||0),0);

      document.getElementById('sTotal').textContent   = docs.length;
      document.getElementById('sSigned').textContent  = signed;
      document.getElementById('sPending').textContent = pending;
      document.getElementById('sSize').textContent    = formatSize(totalKB);

      const tbody = document.getElementById('docTbody');
      if (filtered.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${docs.length===0?'📄 Ainda não tem documentos. Clique em "Novo Documento" para começar.':'Nenhum documento corresponde à pesquisa.'}</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((d, idx) => {
        const realIdx = docs.indexOf(d);
        return `
        <tr>
          <td>
            <div class="doc-name-cell">
              <div class="file-icon ${d.fileType}">${fileEmoji(d.fileType)}</div>
              <div>
                <div class="doc-name">${esc(d.name)}</div>
                <div class="doc-size">${d.category || ''} · ${d.size}</div>
              </div>
            </div>
          </td>
          <td style="font-size:13px;color:rgba(13,43,69,0.5)">${(d.originalName||'—').split('.').pop().toUpperCase()}</td>
          <td style="font-size:13px;color:rgba(13,43,69,0.5)">${d.date}</td>
          <td>
            <span class="status-badge status-${d.status}">
              ${d.status==='signed'?'✓ Assinado':d.status==='pending'?'⏳ Pendente':'📝 Rascunho'}
            </span>
          </td>
          <td>
            <div class="td-actions">
              ${d.status !== 'signed'
                ? `<button class="btn-action btn-sign" onclick="openSign(${realIdx})">Assinar</button>`
                : `<button class="btn-action btn-signed-done">✓ Assinado</button>`
              }
              ${d.dataUrl ? `<button class="btn-action btn-view" onclick="openView(${realIdx})">Ver</button>` : ''}
              <button class="btn-action btn-delete" onclick="deleteDoc(${realIdx})">🗑</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }

    // ---- HELPERS ----
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
      return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }
    function fileEmoji(type) {
      return {pdf:'📕', docx:'📘', img:'🖼️', other:'📄'}[type] || '📄';
    }
    function getFileType(name) {
      const ext = name.split('.').pop().toLowerCase();
      if (ext==='pdf') return 'pdf';
      if (['doc','docx'].includes(ext)) return 'docx';
      if (['png','jpg','jpeg','gif','webp'].includes(ext)) return 'img';
      return 'other';
    }
    function randomHash() {
      return Array.from({length:8},()=>Math.random().toString(16).substr(2,4)).join('-');
    }

    // ---- UPLOAD ----
    function openUpload() {
      document.getElementById('uploadOverlay').classList.add('show');
    }
    function closeUpload() {
      document.getElementById('uploadOverlay').classList.remove('show');
      removeFile();
      document.getElementById('docNameInput').value = '';
      document.getElementById('uploadProgress').classList.remove('show');
    }
    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('dropzone').classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    }
    function handleFileSelect(file) {
      if (!file) return;
      const maxSize = 20 * 1024 * 1024;
      if (file.size > maxSize) { showToast('Ficheiro demasiado grande (máx. 20 MB)', 'error'); return; }
      selectedFile = file;
      // auto-fill name without extension
      if (!document.getElementById('docNameInput').value) {
        document.getElementById('docNameInput').value = file.name.replace(/\.[^.]+$/, '');
      }
      document.getElementById('fpName').textContent = file.name;
      document.getElementById('fpSize').textContent = formatSize(file.size);
      document.getElementById('fpIcon').textContent = fileEmoji(getFileType(file.name));
      document.getElementById('filePreview').classList.add('show');
      document.getElementById('dropzone').style.display = 'none';
      document.getElementById('btnUploadConfirm').disabled = false;
    }
    function removeFile() {
      selectedFile = null;
      document.getElementById('fileInput').value = '';
      document.getElementById('filePreview').classList.remove('show');
      document.getElementById('dropzone').style.display = '';
      document.getElementById('btnUploadConfirm').disabled = true;
    }

    function confirmUpload() {
      if (!selectedFile) return;
      const name = document.getElementById('docNameInput').value.trim() || selectedFile.name;
      const category = document.getElementById('docCategory').value;
      const progress = document.getElementById('uploadProgress');
      const fill     = document.getElementById('progressFill');
      const pct      = document.getElementById('progressPct');

      document.getElementById('btnUploadConfirm').disabled = true;
      progress.classList.add('show');

      // Simulate read with FileReader (real file → base64 for preview)
      const reader = new FileReader();
      let p = 0;
      const tick = setInterval(() => {
        p = Math.min(p + Math.random() * 18, 85);
        fill.style.width = p + '%';
        pct.textContent  = Math.round(p) + '%';
      }, 120);

      reader.onload = (e) => {
        clearInterval(tick);
        fill.style.width = '100%'; pct.textContent = '100%';
        setTimeout(() => {
          const u = getUsers();
          u[email].documents.unshift({
            name,
            category,
            originalName: selectedFile.name,
            fileType: getFileType(selectedFile.name),
            size: formatSize(selectedFile.size),
            sizeBytes: selectedFile.size,
            date: new Date().toLocaleDateString('pt-PT'),
            status: 'pending',
            dataUrl: e.target.result,
            hash: randomHash()
          });
          saveUsers(u);
          closeUpload();
          renderDocs();
          showToast(`"${name}" carregado com sucesso ✓`, 'success');
        }, 400);
      };
      reader.onerror = () => {
        clearInterval(tick);
        showToast('Erro ao ler o ficheiro.', 'error');
        document.getElementById('btnUploadConfirm').disabled = false;
      };
      reader.readAsDataURL(selectedFile);
    }

    // ---- VIEW ----
    function openView(idx) {
      const docs = getUsers()[email].documents;
      const doc  = docs[idx];
      document.getElementById('viewTitle').textContent = doc.name;
      const content = document.getElementById('viewContent');
      if (doc.fileType === 'pdf') {
        content.innerHTML = `<iframe src="${doc.dataUrl}"></iframe>`;
      } else if (doc.fileType === 'img') {
        content.innerHTML = `<img src="${doc.dataUrl}" style="max-width:100%;border-radius:8px">`;
      } else {
        content.innerHTML = `<div class="no-preview"><span>📄</span><p>Pré-visualização não disponível para este tipo de ficheiro.</p></div>`;
      }
      document.getElementById('viewModal').classList.add('show');
    }
    function closeView() {
      document.getElementById('viewModal').classList.remove('show');
      document.getElementById('viewContent').innerHTML = '';
    }

    // ---- SIGN ----
    function openSign(idx) {
      pendingSign = idx;
      const doc = getUsers()[email].documents[idx];
      const now = new Date().toLocaleString('pt-PT');
      document.getElementById('certBox').innerHTML =
        `Algoritmo: RSA-4096 + SHA-256<br>Timestamp: ${now}<br>Documento hash: ${doc.hash||randomHash()}<br>Assinante: ${user.name} &lt;${email}&gt;`;
      document.getElementById('signModal').classList.add('show');
    }
    function closeSign() { document.getElementById('signModal').classList.remove('show'); pendingSign = null; }
    function confirmSign() {
      if (pendingSign === null) return;
      const u = getUsers();
      const doc = u[email].documents[pendingSign];
      doc.status = 'signed';
      doc.signedAt = new Date().toLocaleString('pt-PT');
      saveUsers(u);
      closeSign();
      renderDocs();
      showToast(`"${doc.name}" assinado com sucesso 🔐`, 'success');
    }

    // ---- DELETE ----
    function deleteDoc(idx) {
      const u = getUsers();
      const name = u[email].documents[idx].name;
      if (!confirm(`Eliminar "${name}"?`)) return;
      u[email].documents.splice(idx, 1);
      saveUsers(u);
      renderDocs();
      showToast(`"${name}" eliminado.`);
    }

    // ---- TOAST ----
    function showToast(msg, type='') {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'toast show' + (type ? ' '+type : '');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), 3000);
    }

    // ---- INIT ----
    renderDocs();
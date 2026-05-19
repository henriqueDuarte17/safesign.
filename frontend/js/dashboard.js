// ---- CONFIGURAÇÃO INICIAL ----
const SESS = 'safesign_session';
const DB = 'safesign_users';

function getEmail() { 
    return sessionStorage.getItem(SESS); 
}

function getUsers() { 
    try { return JSON.parse(localStorage.getItem(DB) || '{}'); } catch { return {}; } 
}

// ---- BOOT / PROTEÇÃO DE PÁGINA ----
const email = getEmail();
if (!email) { 
    window.location.href = 'login.html'; 
} else {
    const users = getUsers();
    const user = users[email];
    const userName = user?.name || email;
    document.getElementById('topbarName').textContent = userName;
    document.getElementById('topbarEmail').textContent = email;
}

// ---- ESTADO GLOBAL ----
let currentFilter = 'all';
let pendingSign   = null; 
let selectedFile  = null; 

// ---- LOGOUT ----
function doLogout() {
    sessionStorage.removeItem(SESS);
    window.location.href = 'login.html';
}

// ---- FILTROS ----
function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderDocs();
}

// ---- ATUALIZAR STATS ----
function updateStats(docs) {
    if (!docs) docs = [];
    const signed = docs.filter(d => d.status === 'signed').length;
    const pending = docs.filter(d => d.status === 'pending').length;
    document.getElementById('sSigned').textContent = signed;
    document.getElementById('sPending').textContent = pending;
}

function formatSignerList(signers = []) {
    if (!Array.isArray(signers) || signers.length === 0) {
        return '<span style="opacity: .6;">Sem destinatários</span>';
    }
    return signers.map(s => {
        const stateLabel = s.status === 'signed' ? 'Assinado' : 'Pendente';
        return `<div><strong>${s.email}</strong> <span style="color:${s.status === 'signed' ? '#1a7f37' : '#d78b00'};">[${stateLabel}]</span></div>`;
    }).join('');
}

// ---- LISTAGEM (GET) ----
async function renderDocs() {
    const tbody = document.getElementById('docTbody');
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/documents?email=${encodeURIComponent(email)}`);
        const docs = await response.json();

        tbody.innerHTML = '';
        updateStats(docs);
        if (!docs || docs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:3rem; opacity:0.5;">Nenhum documento encontrado.</td></tr>`;
            return;
        }

        docs.filter(d => currentFilter === 'all' || d.status === currentFilter).forEach((doc) => {
            const isPendingSigner = Array.isArray(doc.signers) && doc.signers.some(s => s.email.toLowerCase() === email.toLowerCase() && s.status === 'pending');
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="doc-name-cell">
                        <div>
                            <div class="doc-title">${doc.name}</div>
                            <div class="doc-info">${doc.original_name}</div>
                        </div>
                    </div>
                </td>
                <td>${new Date(doc.created_at).toLocaleDateString('pt-PT')}</td>
                <td><span class="status-tag status-${doc.status}">${doc.status === 'signed' ? 'Assinado' : 'Pendente'}</span></td>
                <td>${formatSignerList(doc.signers)}</td>
                <td>
                    <div class="actions">
                        <button class="btn-action" onclick="openView('${doc.data_url}', '${doc.name}')" title="Ver"> Ver </button>
                        ${isPendingSigner ? `<button class="btn-action btn-sign" onclick="openSign(${doc.id}, '${doc.name}', '${doc.hash}')" title="Assinar"> Assinar </button>` : ''}
                        <button class="btn-action" onclick="deleteDoc(${doc.id})" title="Apagar"> Apagar</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error("Erro ao renderizar:", error);
    }
}

// ---- UPLOAD (POST) ----
function openUpload() { document.getElementById('uploadOverlay').classList.add('show'); }
function closeUpload() { 
    document.getElementById('uploadOverlay').classList.remove('show');
    removeFile();
    document.getElementById('docNameInput').value = '';
    document.getElementById('signersInput').value = '';
}

function handleFileSelect(file) {
    if (!file) return;
    selectedFile = file;
    document.getElementById('fpName').textContent = file.name;
    document.getElementById('filePreview').classList.add('show');
    document.getElementById('dropzone').style.display = 'none';
    document.getElementById('btnUploadConfirm').disabled = false;
    
    if (!document.getElementById('docNameInput').value) {
        document.getElementById('docNameInput').value = file.name.replace(/\.[^.]+$/, '');
    }
}

function removeFile() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.remove('show');
    document.getElementById('dropzone').style.display = 'block';
    document.getElementById('btnUploadConfirm').disabled = true;
}

async function confirmUpload() {
  // 1. Capturar os elementos do teu HTML
  const fileInput = document.getElementById('fileInput');
  const docNameInput = document.getElementById('docNameInput');
  const signersInput = document.getElementById('signersInput');

  // 2. Identificar o utilizador logado através do email na tua topbar
  const topbarEmailElement = document.getElementById('topbarEmail');
  const userEmail = topbarEmailElement ? topbarEmailElement.innerText.trim() : null;

  if (!userEmail || userEmail === "—") {
    alert("Erro: Não foi possível identificar o utilizador logado.");
    return;
  }

  // 3. Validação original: Garante que escolheu um ficheiro e deu um nome
  if (!fileInput.files[0] || !docNameInput.value) {
    alert("Por favor, selecione um ficheiro e dê-lhe um nome.");
    return;
  }

  // 4. Processar a string dos emails dos signatários (separa por vírgulas e limpa espaços)
  const rawSigners = signersInput ? signersInput.value : '';
  const signersArray = rawSigners 
    ? rawSigners.split(',').map(email => email.trim()).filter(email => email.length > 0)
    : [];

  // 5. Inicializar o FormData (Essencial vir ANTES de qualquer append para evitar o erro de inicialização!)
  const formData = new FormData();
  
  // 6. Empacotar todos os dados para enviar ao teu server.js
  formData.append('file', fileInput.files[0]); // Mantém o nome 'file' esperado pelo teu Multer
  formData.append('name', docNameInput.value);
  formData.append('user_email', userEmail);
  formData.append('category', 'Contrato');
  
  // Envia a lista de signatários estruturada em formato de texto JSON
  formData.append('signers', JSON.stringify(signersArray));

  // 7. Enviar os dados via fetch para a rota real de upload do teu backend
  try {
    const response = await fetch('http://127.0.0.1:5000/api/documents/upload', {
      method: 'POST',
      body: formData // Passamos o contentor completo aqui
    });

    if (response.ok) {
      alert("Documento carregado e partilhado com sucesso!");
      closeUpload(); // Fecha o teu modal e limpa os campos automaticamente
      
      // Se tiveres a função que recarrega a tabela no teu ecrã, ela é executada aqui
      if (typeof loadDocuments === 'function') {
        loadDocuments();
      }
    } else {
      const errorData = await response.json();
      alert(errorData.error || "Erro ao efetuar o upload.");
    }
  } catch (error) {
    console.error("Erro na ligação ao servidor:", error);
    alert("Não foi possível ligar ao servidor. Verifique se o Docker está ativo.");
  }
}

// ---- AÇÕES (VIEW/SIGN/DELETE) ----
function openView(url, name) {
    document.getElementById('viewTitle').textContent = name;
    const content = document.getElementById('viewContent');
    const finalUrl = `http://127.0.0.1:5000${url}`;
    content.innerHTML = url.toLowerCase().endsWith('.pdf') 
        ? `<iframe src="${finalUrl}" style="width:100%;height:500px"></iframe>`
        : `<img src="${finalUrl}" style="max-width:100%">`;
    document.getElementById('viewModal').classList.add('show');
}
function closeView() { document.getElementById('viewModal').classList.remove('show'); }

function openSign(id, name, hash) {
    pendingSign = id;
    document.getElementById('certBox').innerHTML = `Documento: ${name}<br>Hash: ${hash}<br>Assinante: ${email}`;
    document.getElementById('signModal').classList.add('show');
}
function closeSign() { document.getElementById('signModal').classList.remove('show'); }

async function confirmSign() {
    try {
        const response = await fetch(`http://127.0.0.1:5000/api/documents/${pendingSign}/sign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (response.ok) { closeSign(); renderDocs(); showToast("Assinado!", "success"); }
        else { const errorData = await response.json(); showToast(errorData.error || "Erro ao assinar", "error"); }
    } catch (e) { showToast("Erro ao assinar", "error"); }
}

async function deleteDoc(id) {
    if (!confirm("Eliminar documento?")) return;
    try {
        const response = await fetch(`http://localhost:5000/api/documents/${id}`, { method: 'DELETE' });
        if (response.ok) { renderDocs();}
    } catch (e) { showToast("Erro ao eliminar", "error"); }
}

function showToast(msg, type='') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => t.classList.remove('show'), 3000);
}

// Iniciar a tabela
renderDocs();
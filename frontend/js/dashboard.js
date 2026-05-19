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
    
    // Alinhado com os IDs reais do teu HTML original
    if(document.getElementById('topbarName')) document.getElementById('topbarName').textContent = userName;
    if(document.getElementById('topbarEmail')) document.getElementById('topbarEmail').textContent = email;
}

// ---- ESTADO GLOBAL ----
let documentsData = [];
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
    if(btn) btn.classList.add('active');
    renderDocuments();
}

// ---- ATUALIZAR STATS ----
function updateStats(docs) {
    if (!docs) docs = [];
    const signed = docs.filter(d => d.status === 'signed').length;
    const pending = docs.filter(d => d.status === 'pending').length;
    if(document.getElementById('sSigned')) document.getElementById('sSigned').textContent = signed;
    if(document.getElementById('sPending')) document.getElementById('sPending').textContent = pending;
}

function formatSignerList(signers = []) {
    if (!Array.isArray(signers) || signers.length === 0) {
        return '<span style="opacity: .6;">Sem destinatários</span>';
    }
    return signers.map(s => {
        const stateLabel = s.status === 'signed' ? 'Assinado' : 'Pendente';
        const hashInfo = s.signature_hash ? `<div style="font-size:0.8rem;opacity:.7;word-break:break-all;">Sig: ${s.signature_hash.substring(0,20)}...</div>` : '';
        return `<div><strong>${s.email}</strong> <span style="color:${s.status === 'signed' ? '#1a7f37' : '#d78b00'};">[${stateLabel}]</span>${hashInfo}</div>`;
    }).join('');
}

// =========================================================================
// FUNÇÃO: RENDERIZAR OS DOCUMENTOS NA TABELA (CORRIGIDO PARA O TEU HTML)
// =========================================================================
function renderDocuments() {
    const tableBody = document.getElementById('docTbody'); // ID real do teu HTML
    if (!tableBody) return;

    tableBody.innerHTML = '';
    updateStats(documentsData);

    // Filtrar os documentos localmente de acordo com a aba selecionada
    const filteredDocs = documentsData.filter(doc => {
        if (currentFilter === 'all') return true;
        return String(doc.status).toLowerCase() === currentFilter.toLowerCase();
    });

    if (filteredDocs.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:3rem; opacity:0.5;">Nenhum documento encontrado.</td></tr>`;
        return;
    }

    filteredDocs.forEach(doc => {
        const tr = document.createElement('tr');

        // Verificar se o utilizador logado é um dos signatários pendentes
        const isPendingSigner = Array.isArray(doc.signers) && doc.signers.some(s => s.email.toLowerCase() === email.toLowerCase() && s.status === 'pending');

        // Gerar botões de ação dinâmicos em conformidade com o teu CSS original
        let actionButtons = `<button class="btn-action btn-view" onclick="openView('${doc.data_url}', '${doc.name}')" title="Ver"> Ver </button>`;
        
        if (isPendingSigner) {
            actionButtons += ` <button class="btn-action btn-sign" onclick="openSign(${doc.id}, '${doc.name}', '${doc.hash}')" title="Assinar"> Assinar </button>`;
        }

        actionButtons += ` <button class="btn-action btn-delete" onclick="deleteDoc(${doc.id})" title="Apagar"> Apagar</button>`;

        tr.innerHTML = `
            <td>
                <div class="doc-name-cell">
                    <div>
                        <div class="doc-title"><strong>${doc.name || 'Sem nome'}</strong></div>
                        <div class="doc-size" style="font-size:11px; opacity:0.6;">${doc.original_name || ''}</div>
                    </div>
                </div>
            </td>
            <td>${doc.created_at ? new Date(doc.created_at).toLocaleDateString('pt-PT') : '---'}</td>
            <td><span class="status-tag status-${doc.status}" style="font-weight:600; text-transform:uppercase;">${doc.status === 'signed' ? 'Assinado' : 'Pendente'}</span></td>
            <td>${formatSignerList(doc.signers)}</td>
            <td><div class="actions">${actionButtons}</div></td>
        `;

        tableBody.appendChild(tr);
    });
}

// =========================================================================
// FUNÇÃO: CARREGAR DOCUMENTOS DA API BACKEND
// =========================================================================
function fetchDocuments() {
    if (!email) return;
    console.log(`[API] A procurar documentos para o e-mail: ${email}`);
    fetch(`http://localhost:5000/api/documents?email=${encodeURIComponent(email)}`)
        .then(res => {
            if (!res.ok) throw new Error('Erro na resposta do servidor.');
            return res.json();
        })
        .then(data => {
            console.log('[API] Documentos recebidos com sucesso:', data);
            documentsData = Array.isArray(data) ? data : [];
            renderDocuments();
        })
        .catch(err => {
            console.error('[ERRO DASHBOARD]:', err);
            const tbody = document.getElementById('docTbody');
            if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar documentos do servidor.</td></tr>`;
        });
}

// =========================================================================
// MODAL DE UPLOAD INTERFACES
// =========================================================================
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

// =========================================================================
// CONFIRMAR UPLOAD (ESTRUTURA DE ACORDO COM O TEU HTML ORIGINAL)
// =========================================================================
async function confirmUpload() {
  const fileInput = document.getElementById('fileInput');
  const docNameInput = document.getElementById('docNameInput');
  const signersInput = document.getElementById('signersInput');

  if (!fileInput.files[0] || !docNameInput.value) {
    alert("Por favor, selecione um ficheiro e dê-lhe um nome.");
    return;
  }

  const rawSigners = signersInput ? signersInput.value : '';
  const signersArray = rawSigners 
    ? rawSigners.split(',').map(e => e.trim()).filter(e => e.length > 0)
    : [];

  const formData = new FormData();
  formData.append('file', fileInput.files[0]); 
  formData.append('name', docNameInput.value);
  formData.append('user_email', email);
  formData.append('category', 'Contrato');
  formData.append('signers', JSON.stringify(signersArray));

  console.log('[UPLOAD] A enviar documento cifrado AES para o servidor...');

  try {
    const response = await fetch('http://localhost:5000/api/documents/upload', {
      method: 'POST',
      body: formData 
    });

    if (response.ok) {
      alert("Documento carregado, cifrado com AES-GCM e protegido com sucesso!");
      closeUpload(); 
      fetchDocuments(); // Recarrega a tabela imediatamente
    } else {
      const errorData = await response.json();
      alert(errorData.error || "Erro ao efetuar o upload.");
    }
  } catch (error) {
    console.error("Erro na ligação ao servidor:", error);
    alert("Não foi possível ligar ao servidor.");
  }
}

// =========================================================================
// MODAL DE ASSINATURA E VISUALIZAÇÃO
// =========================================================================
function openView(url, name) {
    document.getElementById('viewTitle').textContent = name;
    const content = document.getElementById('viewContent');
    const finalUrl = `http://localhost:5000${url}`;
    content.innerHTML = url.toLowerCase().endsWith('.pdf') 
        ? `<iframe src="${finalUrl}" style="width:100%;height:500px"></iframe>`
        : `<img src="${finalUrl}" style="max-width:100%">`;
    document.getElementById('viewModal').classList.add('show');
}
function closeView() { document.getElementById('viewModal').classList.remove('show'); }

function openSign(id, name, hash) {
    pendingSign = id;
    document.getElementById('certBox').innerHTML = `Algoritmo: RSA-PSS + SHA-256<br>Documento: ${name}<br>Hash: ${hash}<br>Assinante: ${email}`;
    document.getElementById('signModal').classList.add('show');
}
function closeSign() { document.getElementById('signModal').classList.remove('show'); }

async function confirmSign() {
    try {
        const response = await fetch(`http://localhost:5000/api/documents/${pendingSign}/sign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        if (response.ok) { 
            closeSign(); 
            fetchDocuments(); // Sincroniza e recarrega na hora
            showToast("Assinado com par de chaves RSA-PSS!", "success"); 
        } else { 
            const errorData = await response.json(); 
            showToast(errorData.error || "Erro ao assinar", "error"); 
        }
    } catch (e) { 
        showToast("Erro ao assinar", "error"); 
    }
}

async function deleteDoc(id) {
    if (!confirm("Eliminar documento?")) return;
    try {
        const response = await fetch(`http://localhost:5000/api/documents/${id}`, { method: 'DELETE' });
        if (response.ok) { fetchDocuments(); }
    } catch (e) { showToast("Erro ao eliminar", "error"); }
}

function showToast(msg, type='') {
    const t = document.getElementById('toast');
    if(t) {
        t.textContent = msg;
        t.className = 'toast show ' + type;
        setTimeout(() => t.classList.remove('show'), 3000);
    }
}

// Inicialização da página
fetchDocuments();
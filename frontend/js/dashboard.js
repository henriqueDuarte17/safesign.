// ---- CONFIGURAÇÃO INICIAL ----
const SESS = 'safesign_session';

function getEmail() { 
    return sessionStorage.getItem(SESS); 
}

// ---- BOOT / PROTEÇÃO DE PÁGINA ----
const email = getEmail();
if (!email) { 
    window.location.href = 'login.html'; 
} else {
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

// ---- LISTAGEM (GET) ----
async function renderDocs() {
    const tbody = document.getElementById('docTbody');
    try {
        const response = await fetch(`http://localhost:3000/api/documents/${encodeURIComponent(email)}`);
        const docs = await response.json();

        tbody.innerHTML = '';
        if (!docs || docs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:3rem; opacity:0.5;">Nenhum documento encontrado.</td></tr>`;
            return;
        }

        docs.filter(d => currentFilter === 'all' || d.status === currentFilter).forEach((doc) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="doc-name-cell">
                        <div class="doc-icon">${doc.category === 'Contrato' ? '📜' : '📄'}</div>
                        <div>
                            <div class="doc-title">${doc.name}</div>
                            <div class="doc-info">${doc.original_name}</div>
                        </div>
                    </div>
                </td>
                <td><span class="category-tag">${doc.category}</span></td>
                <td>${new Date(doc.created_at).toLocaleDateString('pt-PT')}</td>
                <td><span class="status-tag status-${doc.status}">${doc.status === 'signed' ? 'Assinado' : 'Pendente'}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn-action" onclick="openView('${doc.data_url}', '${doc.name}')" title="Ver">👁️</button>
                        ${doc.status === 'pending' ? `<button class="btn-action btn-sign" onclick="openSign(${doc.id}, '${doc.name}', '${doc.hash}')" title="Assinar">✍️</button>` : ''}
                        <button class="btn-action" onclick="deleteDoc(${doc.id})" title="Apagar">🗑️</button>
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
    console.log("Iniciando upload..."); // Teste na consola
    if (!selectedFile) return;

    const btn = document.getElementById('btnUploadConfirm');
    btn.disabled = true;
    btn.textContent = 'A carregar...';

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('name', document.getElementById('docNameInput').value);
    formData.append('category', document.getElementById('docCategory').value);
    formData.append('user_email', email);
    formData.append('hash', 'hash_' + Math.random().toString(36).substring(7));

    try {
        const response = await fetch('http://localhost:3000/api/documents/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            closeUpload();
            renderDocs();
            showToast("Documento carregado!", "success");
        } else {
            showToast("Erro no servidor", "error");
        }
    } catch (error) {
        console.error(error);
        showToast("Erro de ligação", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = 'Carregar Documento';
    }
}

// ---- AÇÕES (VIEW/SIGN/DELETE) ----
function openView(url, name) {
    document.getElementById('viewTitle').textContent = name;
    const content = document.getElementById('viewContent');
    const finalUrl = `http://localhost:3000${url}`;
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
        const response = await fetch(`http://localhost:3000/api/documents/${pendingSign}/sign`, { method: 'PATCH' });
        if (response.ok) { closeSign(); renderDocs(); showToast("Assinado!", "success"); }
    } catch (e) { showToast("Erro ao assinar", "error"); }
}

async function deleteDoc(id) {
    if (!confirm("Eliminar documento?")) return;
    try {
        const response = await fetch(`http://localhost:3000/api/documents/${id}`, { method: 'DELETE' });
        if (response.ok) { renderDocs(); showToast("Eliminado"); }
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
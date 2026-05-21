// ---- CONFIGURAÇÃO INICIAL ----
const SESS = 'safesign_session';
const DB = 'safesign_users';

// recupera o email do utilizador logado
function getEmail() {
    return sessionStorage.getItem(SESS);
}

// obtem a lista dos utilizadores registados
function getUsers() {
    try { return JSON.parse(localStorage.getItem(DB) || '{}'); } catch { return {}; }
}

// ----PROTEÇÃO DE PÁGINA ---- bloqueia o acesso à dashboard se não houver sessão ativa
const email = getEmail();
if (!email) {
    // redireciona para a página de login se não houver email na sessão
    window.location.href = 'login.html';
} else {
    // apresenta os dados do utilizador nos elementos do perfil na topbarq
    const users = getUsers();
    const user = users[email];
    const userName = user?.name || email;

    if (document.getElementById('topbarName')) document.getElementById('topbarName').textContent = userName;
    if (document.getElementById('topbarEmail')) document.getElementById('topbarEmail').textContent = email;
}

// ---- ESTADO GLOBAL ----
let documentsData = [];
let currentFilter = 'all';
let pendingSign = null;
let selectedFile = null;

// ---- LOGOUT ----
function doLogout() {
    sessionStorage.removeItem(SESS);
    window.location.href = 'login.html';
}

// ---- altera o filtro ativo e atualiza a tabela ----
function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderDocuments();
}

// ---- atualizacao das estatisticas de assinados e pendentes ----
function updateStats(docs) {
    if (!docs) docs = [];
    const signed = docs.filter(d => d.status === 'signed').length;
    const pending = docs.filter(d => d.status === 'pending').length;
    if (document.getElementById('sSigned')) document.getElementById('sSigned').textContent = signed;
    if (document.getElementById('sPending')) document.getElementById('sPending').textContent = pending;
}

//gera o bloco HTML para renderizar a lista de signatarios na tabela 
function formatSignerList(signers = []) {
    if (!Array.isArray(signers) || signers.length === 0) {
        return '<span style="opacity: .6;">Sem destinatários</span>';
    }
    return signers.map(s => {
        const stateLabel = s.status === 'signed' ? 'Assinado' : 'Pendente';
        const hashInfo = s.signature_hash ? `<div style="font-size:0.8rem;opacity:.7;word-break:break-all;">Sig: ${s.signature_hash.substring(0, 20)}...</div>` : '';
        return `<div><strong>${s.email}</strong> <span style="color:${s.status === 'signed' ? '#1a7f37' : '#d78b00'};">[${stateLabel}]</span>${hashInfo}</div>`;
    }).join('');
}

// FUNÇÃO: reconstroi as linhas da tabela de documentos com base no estado global filtrado

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

// Faz o pedido HTTPS GET ao servidor para listar todos os documentos associados ao utilizador

function fetchDocuments() {
    if (!email) return;
    console.log(`[API] A procurar documentos para o e-mail: ${email}`);
    fetch(`https://localhost:5000/api/documents?email=${encodeURIComponent(email)}`).then(res => {
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
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">Erro ao carregar documentos do servidor.</td></tr>`;
        });
}

// controla a interface de arrastar ficheiros

function openUpload() { document.getElementById('uploadOverlay').classList.add('show'); }
function closeUpload() {
    document.getElementById('uploadOverlay').classList.remove('show');
    removeFile();
    document.getElementById('docNameInput').value = '';
    document.getElementById('signersInput').value = '';
}

// Executada quando um ficheiro é inserido na Dropzone; atualiza o File Preview interno
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

// Remove o ficheiro selecionado e restaura o modal de upload para o estado inicial
function removeFile() {
    selectedFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('filePreview').classList.remove('show');
    document.getElementById('dropzone').style.display = 'block';
    document.getElementById('btnUploadConfirm').disabled = true;
}

// Constrói o FormData, processa a string de e-mails e envia o novo documento para a API do servidor

async function confirmUpload() {
    const fileInput = document.getElementById('fileInput');
    const docNameInput = document.getElementById('docNameInput');
    const signersInput = document.getElementById('signersInput');

    if (!fileInput.files[0] || !docNameInput.value) {
        alert("Por favor, selecione um ficheiro e dê-lhe um nome.");
        return;
    }
    // REQUISITO CO-ASSINATURAS: Separa a string de e-mails por vírgulas e remove os espaços vazios
    const rawSigners = signersInput ? signersInput.value : '';
    const signersArray = rawSigners
        ? rawSigners.split(',').map(e => e.trim()).filter(e => e.length > 0)
        : [];
    //Cria o empacotamento multipart para suportar envio de ficheiros e textos na mesma chamada
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('name', docNameInput.value);
    formData.append('user_email', email);
    formData.append('category', 'Contrato');
    formData.append('signers', JSON.stringify(signersArray));

    console.log('[UPLOAD] A enviar documento cifrado AES para o servidor...');

    try {
        const response = await fetch('https://localhost:5000/api/documents/upload', {
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

// MODAL DE ASSINATURA E VISUALIZAÇÃO
//Abre o visualizador integrado de documentos carregando a imagem ou o PDF via iframe do servidor
function openView(url, name) {
    document.getElementById('viewTitle').textContent = name;
    const content = document.getElementById('viewContent');
    const finalUrl = `https://localhost:5000${url}`;
    content.innerHTML = url.toLowerCase().endsWith('.pdf')
        ? `<iframe src="${finalUrl}" style="width:100%;height:500px"></iframe>`
        : `<img src="${finalUrl}" style="max-width:100%">`;
    document.getElementById('viewModal').classList.add('show');
}
function closeView() { document.getElementById('viewModal').classList.remove('show'); }

//Abre a caixa de confirmação com os dados criptográficos da assinatura RSA antes de executar a ação
function openSign(id, name, hash) {
    pendingSign = id;
    document.getElementById('certBox').innerHTML = `Algoritmo: RSA-PSS + SHA-256<br>Documento: ${name}<br>Hash: ${hash}<br>Assinante: ${email}`;
    document.getElementById('signModal').classList.add('show');
}
function closeSign() { document.getElementById('signModal').classList.remove('show'); }

//Executa o pedido HTTPS PATCH para registar formalmente a assinatura digital do utilizador corrente
async function confirmSign() {
    try {
        const response = await fetch(`https://localhost:5000/api/documents/${pendingSign}/sign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        if (response.ok) {
            closeSign();
            fetchDocuments(); // Sincroniza e recarrega na hora
        } else {
            const errorData = await response.json();
            showToast(errorData.error || "Erro ao assinar", "error");
        }
    } catch (e) {
        showToast("Erro ao assinar", "error");
    }
}
//Envia um pedido HTTPS DELETE para remover de forma permanente o registo e ficheiro do servidor
async function deleteDoc(id) {
    if (!confirm("Eliminar documento?")) return;
    try {
        const response = await fetch(`https://localhost:5000/api/documents/${id}`, { method: 'DELETE' });
        if (response.ok) { fetchDocuments(); }
    } catch (e) { showToast("Erro ao eliminar", "error"); }
}

// Inicialização da página
fetchDocuments();
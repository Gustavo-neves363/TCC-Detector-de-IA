const API_URL = "http://127.0.0.1:8000/api";

let currentUser = JSON.parse(localStorage.getItem("detector_user")) || null;
let isRegisterMode = false;
let myChart = null;

// Função auxiliar para tratar sessão expirada / token inválido (401)
function handleUnauthorized() {
    if (currentUser) {
        localStorage.removeItem("detector_user");
        currentUser = null;
        updateUserInterface();
        alert("A sua sessão expirou ou o token é inválido. Por favor, faça login novamente.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const btnAnalyze = document.getElementById("btn-analyze");
    const textInput = document.getElementById("text-input");
    const resultsSection = document.getElementById("resultados");
    const fileInput = document.getElementById("file-input");
    const fileNameDisplay = document.getElementById("file-name");
    const btnClearHistory = document.getElementById("btn-clear-history");
    const btnDemo = document.getElementById("btn-demo");
    const charCount = document.getElementById("char-count");
    const wordCount = document.getElementById("word-count");
    const btnLogout = document.getElementById("btn-logout");
    const formAuth = document.getElementById("form-auth");

    // Inicialização da interface
    updateUserInterface();
    renderHistory();
    renderLogs();

    // Evento Form Autenticação (Login / Cadastro)
    if (formAuth) {
        formAuth.addEventListener("submit", handleAuthSubmit);
    }

    // Logout
    if (btnLogout) {
        btnLogout.addEventListener("click", () => {
            localStorage.removeItem("detector_user");
            currentUser = null;
            updateUserInterface();
            alert("Sessão encerrada com sucesso.");
            window.location.href = "index.html";
        });
    }

    // Contadores de Caracteres e Palavras
    if (textInput) {
        textInput.addEventListener("input", () => {
            const text = textInput.value;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            if (charCount) charCount.textContent = `Caracteres: ${text.length}`;
            if (wordCount) wordCount.textContent = `Palavras: ${words}`;
        });
    }

    // Botão Texto de Exemplo (Demo)
    if (btnDemo && textInput) {
        btnDemo.addEventListener("click", () => {
            textInput.value = "É importante destacar que a inteligência artificial desempenha um papel fundamental no desenvolvimento da sociedade moderna. Além disso, a implementação de sistemas inteligentes otimiza processos e aumenta a eficiência operacional. Ademais, a análise de dados em larga escala permite a tomada de decisões estratégicas de forma rápida e precisa. Por conseguinte, as organizações que adotam estas tecnologias obtêm uma vantagem competitiva significativa no mercado. Em suma, a transformação digital impulsionada pela inteligência artificial é essencial para o progresso contínuo de diversos setores.";
            textInput.dispatchEvent(new Event('input'));
        });
    }

    // Leitura de Arquivo (.txt)
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
                if (!file.name.endsWith('.txt') && file.type !== "text/plain") {
                    alert("Por favor, selecione um arquivo no formato de texto simples (.txt).");
                    return;
                }
                if (fileNameDisplay) fileNameDisplay.textContent = file.name;
                const reader = new FileReader();
                reader.onload = (event) => {
                    textInput.value = event.target.result;
                    textInput.dispatchEvent(new Event('input'));
                };
                reader.readAsText(file);
            }
        });
    }

    // Botão Analisar Texto
    if (btnAnalyze && textInput) {
        btnAnalyze.addEventListener("click", async () => {
            const text = textInput.value.trim();

            if (!text) {
                alert("Insira um texto para realizar a verificação.");
                return;
            }

            btnAnalyze.innerHTML = "⏳ Processando...";
            btnAnalyze.disabled = true;

            try {
                const headers = { "Content-Type": "application/json" };
                if (currentUser && currentUser.token) {
                    headers["Authorization"] = `Bearer ${currentUser.token}`;
                }

                const response = await fetch(`${API_URL}/analisar`, {
                    method: "POST",
                    headers: headers,
                    body: JSON.stringify({ texto: text })
                });

                if (response.status === 401) {
                    handleUnauthorized();
                    return;
                }

                if (response.ok) {
                    const data = await response.json();
                    
                    document.getElementById("res-score").textContent = `${data.percentual_ia}%`;
                    document.getElementById("res-perplexity").textContent = data.perplexidade;
                    document.getElementById("res-burstiness").textContent = data.burstiness;
                    
                    const statusEl = document.getElementById("res-status");
                    
                    if (data.percentual_ia > 60) {
                        statusEl.textContent = "Alta probabilidade sintética (IA)";
                        statusEl.style.color = "var(--accent-red, #ef4444)";
                    } else if (data.percentual_ia > 30) {
                        statusEl.textContent = "Probabilidade Média / Texto Misto";
                        statusEl.style.color = "var(--accent-yellow, #f59e0b)";
                    } else {
                        statusEl.textContent = "Autoria predominantemente Humana";
                        statusEl.style.color = "var(--accent-green, #10b981)";
                    }

                    renderChart(data.percentual_ia);
                    renderHeatmap(data.paragrafos);

                    if (resultsSection) {
                        resultsSection.style.display = "block";
                        resultsSection.scrollIntoView({ behavior: "smooth" });
                    }

                    await renderHistory();
                    await renderLogs();
                } else {
                    const err = await response.json();
                    alert(err.detail || "Erro ao realizar análise.");
                }
            } catch (error) {
                console.error("Erro na requisição:", error);
                alert("Backend indisponível. Verifique se o servidor FastAPI está ligado.");
            } finally {
                btnAnalyze.innerHTML = "⚡ Analisar Texto";
                btnAnalyze.disabled = false;
            }
        });
    }

    // Botão Limpar Histórico
    if (btnClearHistory) {
        btnClearHistory.addEventListener("click", async () => {
            if (!confirm("Tem certeza que deseja limpar o histórico de análises?")) return;
            
            try {
                const headers = {};
                if (currentUser && currentUser.token) {
                    headers["Authorization"] = `Bearer ${currentUser.token}`;
                }

                const res = await fetch(`${API_URL}/historico`, { 
                    method: "DELETE",
                    headers: headers 
                });

                if (res.status === 401) {
                    handleUnauthorized();
                    return;
                }

                if (res.ok) {
                    await renderHistory();
                    await renderLogs();
                } else {
                    alert("Não foi possível limpar o histórico.");
                }
            } catch (e) {
                console.error("Erro ao limpar histórico:", e);
            }
        });
    }
});

// --- RENDERIZAÇÃO DO GRÁFICO (CHART.JS) ---
function renderChart(score) {
    const ctx = document.getElementById('scoreChart').getContext('2d');
    if (myChart) myChart.destroy();

    let highlightColor = '#10b981';
    if (score > 60) {
        highlightColor = '#ef4444';
    } else if (score > 30) {
        highlightColor = '#f59e0b';
    }

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ["IA", "Humano"],
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: [highlightColor, '#334155'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '75%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: { enabled: true } 
            }
        }
    });
}

// --- RENDERIZAÇÃO DO HEATMAP ---
function renderHeatmap(paragrafos) {
    const container = document.getElementById("heatmap-content");
    if (!container || !paragrafos) return;

    container.innerHTML = paragrafos.map(p => {
        let classeCor = "p-human";
        let label = "Humano";

        if (p.score > 60) {
            classeCor = "p-ai-high";
            label = "Alta Probabilidade de IA";
        } else if (p.score > 30) {
            classeCor = "p-ai-medium";
            label = "Suspeito / Misto";
        }

        return `
            <div class="paragraph ${classeCor}">
                <span class="badge">${label} (${p.score}%)</span>
                <p style="margin-top: 5px;">${p.texto}</p>
            </div>
        `;
    }).join('');
}

// --- GERENCIAMENTO DE INTERFACE DE USUÁRIO ---
function updateUserInterface() {
    const displayName = document.getElementById("display-user-name");
    const displayAvatar = document.getElementById("display-avatar");
    const btnOpenLogin = document.getElementById("btn-open-login");
    const btnLogout = document.getElementById("btn-logout");
    const navLogs = document.getElementById("nav-logs");
    const logsSection = document.getElementById("logs-section");

    if (currentUser) {
        if (displayName) displayName.textContent = currentUser.nome;
        if (displayAvatar) displayAvatar.textContent = currentUser.nome.charAt(0).toUpperCase();
        if (btnOpenLogin) btnOpenLogin.style.display = "none";
        if (btnLogout) btnLogout.style.display = "inline-block";

        if (currentUser.perfil === "admin") {
            if (navLogs) navLogs.style.display = "inline-block";
            if (logsSection) logsSection.style.display = "block";
        } else {
            if (navLogs) navLogs.style.display = "none";
            if (logsSection) logsSection.style.display = "none";
        }
    } else {
        if (displayName) displayName.textContent = "Visitante";
        if (displayAvatar) displayAvatar.textContent = "?";
        if (btnOpenLogin) btnOpenLogin.style.display = "inline-block";
        if (btnLogout) btnLogout.style.display = "none";
        if (navLogs) navLogs.style.display = "none";
        if (logsSection) logsSection.style.display = "none";
    }
}

// --- CONTROLE DE MODAIS E AUTENTICAÇÃO ---
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "flex";
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
}

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const regFields = document.getElementById("register-fields");
    const lgpdConsent = document.getElementById("lgpd-consent");
    
    if (regFields) regFields.style.display = isRegisterMode ? "block" : "none";
    if (lgpdConsent) lgpdConsent.style.display = isRegisterMode ? "flex" : "none";
    
    const authTitle = document.getElementById("auth-title");
    const authBtnSubmit = document.getElementById("auth-btn-submit");
    if (authTitle) authTitle.textContent = isRegisterMode ? "Cadastro de Usuário" : "Acesso ao Sistema";
    if (authBtnSubmit) authBtnSubmit.textContent = isRegisterMode ? "Cadastrar" : "Entrar";

    const toggleText = document.getElementById("auth-toggle-text");
    const toggleLink = document.getElementById("auth-toggle-link");
    if (toggleText) toggleText.textContent = isRegisterMode ? "Já tem uma conta?" : "Não tem conta?";
    if (toggleLink) toggleLink.textContent = isRegisterMode ? "Faça Login" : "Cadastre-se";
}

async function handleAuthSubmit(e) {
    if (e) e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const rawSenha = document.getElementById("auth-password").value;

    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8");
    const bytesSenha = encoder.encode(rawSenha).slice(0, 72);
    const senha = decoder.decode(bytesSenha);

    if (isRegisterMode) {
        const nome = document.getElementById("auth-name").value;
        const lgpdCheck = document.getElementById("auth-lgpd-check").checked;

        try {
            const res = await fetch(`${API_URL}/auth/cadastrar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome, email, senha, aceite_lgpd: lgpdCheck })
            });

            const data = await res.json();

            if (res.ok) {
                alert("Cadastro realizado com sucesso! Faça seu login.");
                toggleAuthMode();
            } else {
                alert(data.detail || "Erro ao cadastrar.");
            }
        } catch (err) {
            alert("Erro de comunicação com o servidor.");
        }
    } else {
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, senha })
            });

            const data = await res.json();

            if (res.ok) {
                currentUser = data;
                localStorage.setItem("detector_user", JSON.stringify(data));
                alert(`Bem-vindo, ${data.nome}!`);
                window.location.href = "index.html";
            } else {
                alert(data.detail || "Falha na autenticação.");
            }
        } catch (err) {
            alert("Erro de comunicação com o servidor.");
        }
    }
}

// --- RENDERIZAÇÃO DE HISTÓRICO ---
async function renderHistory() {
    const historyList = document.getElementById("history-list");
    if (!historyList) return;

    try {
        const headers = {};
        if (currentUser && currentUser.token) {
            headers["Authorization"] = `Bearer ${currentUser.token}`;
        }

        const response = await fetch(`${API_URL}/historico`, { headers });
        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) return;

        const history = await response.json();
        if (history.length === 0) {
            historyList.innerHTML = `<p style="color: var(--text-muted, #9ca3af); font-size: 0.9rem;">Nenhuma análise realizada.</p>`;
            return;
        }

        historyList.innerHTML = history.map(item => {
            let color = 'var(--accent-green, #10b981)';
            if (item.percentual_ia > 60) color = 'var(--accent-red, #ef4444)';
            else if (item.percentual_ia > 30) color = 'var(--accent-yellow, #f59e0b)';

            const preview = item.texto_analisado ? `${item.texto_analisado.substring(0, 50)}...` : 'Texto sem prévia';

            return `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.1));">
                    <span style="font-size: 0.9rem; color: #ccc;">"${preview}"</span>
                    <span style="font-weight: 600; font-size: 0.9rem; color: ${color};">${item.percentual_ia}% IA</span>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error("Erro ao carregar histórico:", e);
    }
}

// --- RENDERIZAÇÃO DE LOGS DE AUDITORIA (PAINEL ADMIN) ---
async function renderLogs() {
    const logsBody = document.getElementById("logs-table-body");
    if (!logsBody || !currentUser || currentUser.perfil !== "admin") return;

    try {
        const headers = {};
        if (currentUser && currentUser.token) {
            headers["Authorization"] = `Bearer ${currentUser.token}`;
        }

        const response = await fetch(`${API_URL}/logs`, { headers });
        if (response.status === 401) {
            handleUnauthorized();
            return;
        }
        if (!response.ok) return;

        const logs = await response.json();
        logsBody.innerHTML = logs.map(log => `
            <tr>
                <td style="color: var(--text-muted, #9ca3af);">${log.data_hora}</td>
                <td>${log.usuario_email}</td>
                <td><span style="background: var(--border-color, #374151); padding: 2px 6px; border-radius: 3px;">${log.acao}</span></td>
                <td style="color: var(--text-muted, #9ca3af);">${log.ip_origem}</td>
                <td style="color: ${log.status === 'SUCESSO' ? 'var(--accent-green, #10b981)' : 'var(--accent-red, #ef4444)'}">${log.status}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error("Erro ao carregar logs:", e);
    }
}
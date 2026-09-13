const API_URL = "http://127.0.0.1:8000/api";

document.addEventListener("DOMContentLoaded", () => {
    const btnAnalyze = document.getElementById("btn-analyze");
    const textInput = document.getElementById("text-input");
    const resultsSection = document.getElementById("resultados");
    const fileInput = document.getElementById("file-input");
    const fileNameDisplay = document.getElementById("file-name");
    const historyList = document.getElementById("history-list");
    const btnClearHistory = document.getElementById("btn-clear-history");
    const btnDemo = document.getElementById("btn-demo");
    const charCount = document.getElementById("char-count");
    const wordCount = document.getElementById("word-count");

    // Carrega o histórico do banco MySQL logo ao abrir a página
    renderHistory();

    // 1. Contador de Caracteres e Palavras em Tempo Real
    if (textInput) {
        textInput.addEventListener("input", () => {
            const text = textInput.value;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            if (charCount) charCount.textContent = `Caracteres: ${text.length}`;
            if (wordCount) wordCount.textContent = `Palavras: ${words}`;
        });
    }

    // 2. Botão de Carregar Exemplo Demo
    if (btnDemo && textInput) {
        btnDemo.addEventListener("click", () => {
            textInput.value = "O avanço acelerado da inteligência artificial generativa tem redefinido os paradigms da comunicação digital e da produção de conteúdo. Ferramentas baseadas em modelos de linguagem de grande escala demonstram uma capacidade notável de sintetizar informações complexas. Contudo, vale ressaltar que essa evolução contínua impõe desafios éticos significativos, demandando o desenvolvimento de métodos computacionais robustos.";
            textInput.dispatchEvent(new Event('input'));
        });
    }

    // 3. Upload de Arquivos (.txt)
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (file) {
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

    // 4. Ação do Botão Analisar (Integrada ao Backend / MySQL)
    if (btnAnalyze && textInput) {
        btnAnalyze.addEventListener("click", async () => {
            const text = textInput.value.trim();

            if (!text) {
                alert("Por favor, digite ou cole um texto para analisar.");
                return;
            }

            btnAnalyze.innerHTML = "⏳ Analisando e salvando...";
            btnAnalyze.disabled = true;

            // 1. Executa o seu algoritmo estatístico local no front-end
            const result = runDetection(text);

            if (resultsSection) {
                resultsSection.style.display = "block";
                resultsSection.scrollIntoView({ behavior: "smooth" });
            }

            // 2. Persiste o resultado no banco de dados MySQL via FastAPI
            await saveToHistory(text, result.globalScore);

            btnAnalyze.innerHTML = '<span class="icon">⚡</span> Analisar Texto';
            btnAnalyze.disabled = false;
        });
    }

    // 5. Limpar Histórico (Remoção no MySQL via API)
    if (btnClearHistory) {
        btnClearHistory.addEventListener("click", async () => {
            if (!confirm("Tem certeza que deseja apagar todo o histórico do banco de dados?")) return;

            try {
                const response = await fetch(`${API_URL}/historico`, { method: "DELETE" });
                if (response.ok) {
                    renderHistory();
                } else {
                    alert("Erro ao limpar histórico no banco de dados.");
                }
            } catch (error) {
                console.error("Erro ao apagar histórico:", error);
            }
        });
    }

    // 6. Algoritmo Principal de Detecção de IA
    function runDetection(fullText) {
        const paragraphs = fullText.split(/\n+/).filter(p => p.trim().length > 0);
        let sentenceLengths = [];
        let paragraphData = [];

        const aiKeywords = [
            "ademais", "portanto", "em suma", "por conseguinte", "nesse contexto",
            "vale ressaltar", "é fundamental", "sob essa ótica", "crucial",
            "salientar", "fundamentalmente", "relevante notar", "em síntese"
        ];

        paragraphs.forEach(paragraph => {
            const sentences = paragraph.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const words = paragraph.toLowerCase().match(/\b\w+\b/g) || [];
            
            sentences.forEach(s => {
                const sWords = s.match(/\b\w+\b/g) || [];
                if (sWords.length > 0) sentenceLengths.push(sWords.length);
            });

            const avgWordLen = words.length > 0 ? words.join("").length / words.length : 0;
            const avgSentLen = sentences.length > 0 ? words.length / sentences.length : words.length;

            let keywordCount = 0;
            aiKeywords.forEach(kw => {
                if (paragraph.toLowerCase().includes(kw)) keywordCount++;
            });

            const uniqueWords = new Set(words).size;
            const vocabularyRichness = words.length > 0 ? uniqueWords / words.length : 1;

            let pScore = 35;
            pScore += (avgWordLen - 4.2) * 8;
            pScore += (14 - Math.abs(avgSentLen - 16)) * 1.5;
            pScore += keywordCount * 12;
            pScore -= (vocabularyRichness - 0.5) * 20;

            if (words.length < 6) pScore = 15;

            pScore = Math.min(Math.max(Math.round(pScore), 5), 98);

            paragraphData.push({ text: paragraph, score: pScore });
        });

        const globalScore = Math.round(
            paragraphData.reduce((acc, p) => acc + p.score, 0) / (paragraphData.length || 1)
        );

        const meanSent = sentenceLengths.reduce((a, b) => a + b, 0) / (sentenceLengths.length || 1);
        const variance = sentenceLengths.reduce((a, b) => a + Math.pow(b - meanSent, 2), 0) / (sentenceLengths.length || 1);
        const stdDev = Math.sqrt(variance);
        
        const burstinessVal = sentenceLengths.length > 1 ? (stdDev / (meanSent || 1)).toFixed(2) : "0.00";
        const perplexityVal = (110 - globalScore * 0.85).toFixed(1);

        const scoreCard = document.querySelector('[data-metric="score"]');
        const perplexityCard = document.querySelector('[data-metric="perplexity"]');
        const burstinessCard = document.querySelector('[data-metric="burstiness"]');

        if (scoreCard) {
            scoreCard.querySelector(".metric-value").textContent = `${globalScore}%`;
            const statusEl = scoreCard.querySelector(".metric-status");
            if (statusEl) {
                if (globalScore >= 70) {
                    statusEl.textContent = "Alta probabilidade sintética (IA)";
                    statusEl.style.color = "#ff4d4d";
                } else if (globalScore >= 40) {
                    statusEl.textContent = "Probabilidade Média / Texto Misto";
                    statusEl.style.color = "#ffcc00";
                } else {
                    statusEl.textContent = "Alta probabilidade de autoria Humana";
                    statusEl.style.color = "#00cc66";
                }
            }
        }

        if (perplexityCard) perplexityCard.querySelector(".metric-value").textContent = perplexityVal;
        if (burstinessCard) burstinessCard.querySelector(".metric-value").textContent = burstinessVal;

        const heatmapContent = document.querySelector(".heatmap-content");
        if (heatmapContent) {
            heatmapContent.innerHTML = "";
            paragraphData.forEach(item => {
                const p = document.createElement("p");
                let pClass = item.score >= 70 ? "p-ai-high" : (item.score >= 40 ? "p-ai-medium" : "p-human");
                let label = item.score >= 40 ? `${item.score}% IA` : `${100 - item.score}% Humano`;

                p.className = `paragraph ${pClass}`;
                p.innerHTML = `<span class="badge">${label}</span> ${item.text}`;
                heatmapContent.appendChild(p);
            });
        }

        return { globalScore };
    }

    // 7. Salva no Banco MySQL via POST /api/analisar
    async function saveToHistory(text, score) {
        try {
            const response = await fetch(`${API_URL}/analisar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    texto: text,
                    percentual_ia: score
                })
            });

            if (response.ok) {
                await renderHistory(); // Recarrega a lista trazendo os dados do MySQL
            }
        } catch (error) {
            console.error("Erro ao salvar no banco de dados:", error);
            alert("Atenção: A análise foi calculada na tela, mas não foi possível salvar no MySQL. Verifique se o servidor FastAPI está ligado.");
        }
    }

    // 8. Busca o histórico do MySQL via GET /api/historico
    async function renderHistory() {
        if (!historyList) return;

        try {
            const response = await fetch(`${API_URL}/historico`);
            if (!response.ok) return;

            const history = await response.json();

            if (history.length === 0) {
                historyList.innerHTML = `<p style="color: #888; font-size: 0.9rem;">Nenhuma análise realizada ainda.</p>`;
                return;
            }

            historyList.innerHTML = history.map(item => {
                const dateObj = new Date(item.data_criacao);
                const formattedTime = dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const snippet = item.texto_analisado.substring(0, 60) + (item.texto_analisado.length > 60 ? "..." : "");

                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div>
                            <span style="font-size: 0.85rem; color: #888;">[${formattedTime}]</span>
                            <span style="font-size: 0.95rem; margin-left: 8px;">"${snippet}"</span>
                        </div>
                        <span style="font-weight: 600; font-size: 0.9rem; color: ${item.percentual_ia >= 70 ? '#ff4d4d' : (item.percentual_ia >= 40 ? '#ffcc00' : '#00cc66')}">
                            ${item.percentual_ia}% IA
                        </span>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error("Erro ao buscar histórico do banco:", error);
        }
    }
});
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

    // Carrega o histórico salvo no início
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
            textInput.value = "O avanço acelerado da inteligência artificial generativa tem redefinido os paradigmas da comunicação digital e da produção de conteúdo. Ferramentas baseadas em modelos de linguagem de grande escala demonstram uma capacidade notável de sintetizar informações complexas. Contudo, vale ressaltar que essa evolução contínua impõe desafios éticos significativos, demandando o desenvolvimento de métodos computacionais robustos.";
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

    // 4. Ação do Botão Analisar
    if (btnAnalyze && textInput) {
        btnAnalyze.addEventListener("click", () => {
            const text = textInput.value.trim();

            if (!text) {
                alert("Por favor, digite ou cole um texto para analisar.");
                return;
            }

            btnAnalyze.innerHTML = "⏳ Analisando...";
            btnAnalyze.disabled = true;

            setTimeout(() => {
                const result = runDetection(text);
                
                btnAnalyze.innerHTML = '<span class="icon">⚡</span> Analisar Texto';
                btnAnalyze.disabled = false;

                if (resultsSection) {
                    resultsSection.style.display = "block";
                    resultsSection.scrollIntoView({ behavior: "smooth" });
                }

                // Salva no histórico local
                saveToHistory(text, result.globalScore);
            }, 600);
        });
    }

    // 5. Limpar Histórico
    if (btnClearHistory) {
        btnClearHistory.addEventListener("click", () => {
            localStorage.removeItem("detector_ia_history");
            renderHistory();
        });
    }

    // 6. Algoritmo Principal de Detecção de IA
    function runDetection(fullText) {
        const paragraphs = fullText.split(/\n+/).filter(p => p.trim().length > 0);
        let sentenceLengths = [];
        let paragraphData = [];

        // Lista de marcadores formais típicos de IA em português
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

            // Fator Marcadores Discursivos
            let keywordCount = 0;
            aiKeywords.forEach(kw => {
                if (paragraph.toLowerCase().includes(kw)) keywordCount++;
            });

            // Diversidade Vocabular (TTR - Type Token Ratio)
            const uniqueWords = new Set(words).size;
            const vocabularyRichness = words.length > 0 ? uniqueWords / words.length : 1;

            // Cálculo Combinado de Probabilidade
            let pScore = 35; // Base
            pScore += (avgWordLen - 4.2) * 8; // Palavras longas/formais
            pScore += (14 - Math.abs(avgSentLen - 16)) * 1.5; // Frases uniformes
            pScore += keywordCount * 12; // Presença de conectivos de IA
            pScore -= (vocabularyRichness - 0.5) * 20; // Riqueza vocabular alta reduz a chance de IA

            if (words.length < 6) pScore = 15; // Regra para textos muito curtos

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

        // Atualização dos Cards de Métricas
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

        // Renderiza o Mapa de Calor por Parágrafo
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

    // 7. Funções de Histórico (LocalStorage)
    function saveToHistory(text, score) {
        let history = JSON.parse(localStorage.getItem("detector_ia_history") || "[]");
        
        const newItem = {
            id: Date.now(),
            snippet: text.substring(0, 60) + (text.length > 60 ? "..." : ""),
            score: score,
            date: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        };

        history.unshift(newItem);
        if (history.length > 5) history.pop();

        localStorage.setItem("detector_ia_history", JSON.stringify(history));
        renderHistory();
    }

    function renderHistory() {
        if (!historyList) return;
        
        let history = JSON.parse(localStorage.getItem("detector_ia_history") || "[]");

        if (history.length === 0) {
            historyList.innerHTML = `<p style="color: #888; font-size: 0.9rem;">Nenhuma análise realizada ainda.</p>`;
            return;
        }

        historyList.innerHTML = history.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                <div>
                    <span style="font-size: 0.85rem; color: #888;">[${item.date}]</span>
                    <span style="font-size: 0.95rem; margin-left: 8px;">"${item.snippet}"</span>
                </div>
                <span style="font-weight: 600; font-size: 0.9rem; color: ${item.score >= 70 ? '#ff4d4d' : (item.score >= 40 ? '#ffcc00' : '#00cc66')}">
                    ${item.score}% IA
                </span>
            </div>
        `).join('');
    }
});
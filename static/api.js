import { state, elements } from './state.js';
import { displayAnalysis } from './ui.js';

let analysisTimeout = null;
let currentAnalysisFen = null;
const analysisCache = new Map();
let currentAbortController = null;

export async function analyzePosition() {
    const fen = state.game.fen();
    currentAnalysisFen = fen;
    
    if (analysisCache.has(fen)) {
        displayAnalysis(analysisCache.get(fen), fen);
        elements.loading.classList.add('hidden');
        return;
    }
    
    let tempPrevFen = null;
    const history = state.game.history();
    if (history.length > 0) {
        let tempGame = new Chess();
        tempGame.load_pgn(state.game.pgn());
        tempGame.undo();
        tempPrevFen = tempGame.fen();
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    
    try {
        const depth = parseInt(elements.engineDepth.value) || 15;
        
        const response = await fetch('/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, prev_fen: tempPrevFen, depth: depth }),
            signal: currentAbortController.signal
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        if (currentAnalysisFen !== fen) return;
        analysisCache.set(fen, data);
        displayAnalysis(data, fen);
    } catch (e) {
    } finally {
        if (currentAnalysisFen === fen) elements.loading.classList.add('hidden');
    }
}

export function debouncedAnalyzePosition() {
    clearTimeout(analysisTimeout);
    elements.loading.classList.remove('hidden');
    elements.classification.innerHTML = '-';
    elements.classification.style.color = '#e0e0e0';
    elements.bestMove.textContent = '-';
    elements.evalScore.style.opacity = '0.5';
    elements.evalFill.style.opacity = '0.5';
    analysisTimeout = setTimeout(() => analyzePosition(), 400);
}

export function clearAnalysisCache() {
    analysisCache.clear();
}

export async function runOverallAccuracy(pgnString, btnElement) {
    if (!pgnString || pgnString.trim() === "") return alert("No moves found to analyze!");
    
    const originalText = btnElement.textContent;
    btnElement.textContent = 'Calculating...';
    btnElement.disabled = true;
    elements.accuracyResults.classList.add('hidden');

    try {
        const depth = parseInt(elements.engineDepth.value) || 15;
        
        const response = await fetch('/analyze_full_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnString, depth: depth })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.white || !data.black) throw new Error("Invalid response format.");

        document.getElementById('acc-w-overall').textContent = data.white.overall;
        document.getElementById('acc-w-op').textContent = data.white.opening;
        document.getElementById('acc-w-mid').textContent = data.white.middle;
        document.getElementById('acc-w-end').textContent = data.white.end;

        document.getElementById('acc-b-overall').textContent = data.black.overall;
        document.getElementById('acc-b-op').textContent = data.black.opening;
        document.getElementById('acc-b-mid').textContent = data.black.middle;
        document.getElementById('acc-b-end').textContent = data.black.end;

        elements.accuracyResults.classList.remove('hidden');
    } catch (e) {
        alert("Analysis failed: " + e.message);
    } finally {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
    }
}

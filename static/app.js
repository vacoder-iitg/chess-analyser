import { state, elements } from './state.js';
import { initBoard, updateBoardState, updatePlayerOrientation } from './board.js';
import { updateStatus, drawBadge } from './ui.js';
import { playMoveSan, jumpToMoveUniversal } from './gameLogic.js';
import { debouncedAnalyzePosition, clearAnalysisCache, runOverallAccuracy } from './api.js';
import { plotGameMetrics } from './charts.js';

// Setup Event Listeners

document.getElementById('reset-btn').addEventListener('click', () => {
    state.game.reset();
    state.currentFullPGN = "";
    state.loadedGameMoves = [];
    state.isExploringVariation = false;
    state.variationMoves = [];
    state.deviationIndex = null;
    state.currentMoveIndex = 0;
    state.prevCp = null;
    state.prevMate = null;
    
    state.whitePlayerString = 'White: -';
    state.blackPlayerString = 'Black: -';
    
    updateBoardState();
    updatePlayerOrientation();
    elements.opening.textContent = 'Starting Position';
    elements.evalScore.textContent = '0.00';
    elements.evalFill.style.width = '50%';
    elements.bestMove.textContent = '-';
    elements.classification.innerHTML = '-';
    elements.classification.style.color = '#e0e0e0';
    elements.accuracyResults.classList.add('hidden');
    drawBadge(null, null);
});

document.getElementById('prev-btn').addEventListener('click', () => {
    const source = state.isExploringVariation ? state.variationMoves : state.loadedGameMoves;
    if (state.currentMoveIndex > 0) {
        jumpToMoveUniversal(state.currentMoveIndex - 2, source);
    }
});

document.getElementById('next-btn').addEventListener('click', () => {
    const source = state.isExploringVariation ? state.variationMoves : state.loadedGameMoves;
    if (state.currentMoveIndex < source.length) {
        jumpToMoveUniversal(state.currentMoveIndex, source);
    }
});

document.getElementById('flip-btn').addEventListener('click', () => {
    state.board.set({ orientation: state.board.state.orientation === 'white' ? 'black' : 'white' });
    updatePlayerOrientation();
});

document.getElementById('threats-btn').addEventListener('click', () => {
    const shapes = state.currentThreats.map(t => ({
        orig: t.from,
        dest: t.to,
        brush: 'red'
    }));
    state.board.set({ drawable: { shapes: shapes } });
});

document.getElementById('load-pgn-btn').addEventListener('click', () => {
    const pgnText = elements.pgnInput.value.trim();
    if (!pgnText) return;
    
    let tempGame = new Chess();
    if (tempGame.load_pgn(pgnText)) {
        state.currentFullPGN = tempGame.pgn();
        state.loadedGameMoves = tempGame.history();
        state.isExploringVariation = false;
        state.variationMoves = [];
        state.deviationIndex = null;
        state.currentMoveIndex = 0;
        
        const headers = tempGame.header();
        const wElo = headers.WhiteElo && headers.WhiteElo !== '?' ? ` (${headers.WhiteElo})` : '';
        const bElo = headers.BlackElo && headers.BlackElo !== '?' ? ` (${headers.BlackElo})` : '';
        state.whitePlayerString = `White: ${headers.White || 'Unknown'}${wElo}`;
        state.blackPlayerString = `Black: ${headers.Black || 'Unknown'}${bElo}`;
        
        state.game.reset();
        updateBoardState();
        updatePlayerOrientation();
        
        elements.opening.textContent = 'Starting Position';
        elements.evalScore.textContent = '0.00';
        elements.evalFill.style.width = '50%';
        elements.bestMove.textContent = '-';
        elements.classification.innerHTML = '-';
        elements.classification.style.color = '#e0e0e0';
        elements.accuracyResults.classList.add('hidden');
    } else {
        alert("Invalid PGN format.");
    }
});

document.getElementById('fetch-games-btn').addEventListener('click', async (e) => {
    const platform = document.getElementById('fetch-platform').value;
    const username = document.getElementById('fetch-username').value.trim();
    const timeFormat = document.getElementById('fetch-time').value;
    const btn = e.target;
    
    if (!username) return alert("Please enter a username.");
    
    btn.textContent = 'Fetching...';
    btn.disabled = true;
    elements.fetchGamesList.innerHTML = '';
    
    try {
        const res = await fetch(`/fetch_games?platform=${platform}&username=${username}&time_format=${timeFormat}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        
        if (data.games && data.games.length > 0) {
            data.games.forEach(g => {
                const card = document.createElement('div');
                card.className = 'game-card';
                card.innerHTML = `<strong>${g.white}</strong> vs <strong>${g.black}</strong> <span style="float:right;">${g.result}</span>`;
                card.addEventListener('click', () => {
                    elements.pgnInput.value = g.pgn;
                    document.getElementById('load-pgn-btn').click();
                });
                elements.fetchGamesList.appendChild(card);
            });
        } else {
            elements.fetchGamesList.innerHTML = '<div style="color: #f44336; font-size: 0.85rem;">No games found.</div>';
        }
    } catch (err) {
        elements.fetchGamesList.innerHTML = '<div style="color: #f44336; font-size: 0.85rem;">Error fetching games.</div>';
    } finally {
        btn.textContent = 'Fetch Games';
        btn.disabled = false;
    }
});

elements.engineDepth.addEventListener('change', () => {
    clearAnalysisCache();
    debouncedAnalyzePosition();
});

elements.engineTime.addEventListener('change', () => {
    clearAnalysisCache();
    debouncedAnalyzePosition();
});

document.getElementById('calc-board-accuracy-btn').addEventListener('click', function() {
    if (!state.game.pgn()) return alert("No moves played on the board yet!");
    runOverallAccuracy(state.game.pgn(), this);
});

document.getElementById('calc-pgn-accuracy-btn').addEventListener('click', function() {
    const pgnText = elements.pgnInput.value.trim();
    if (!pgnText) return alert("Please paste a PGN or fetch a game first!");
    runOverallAccuracy(pgnText, this);
});

elements.returnMainlineBtn.addEventListener('click', () => {
    if (state.deviationIndex !== null) {
        state.isExploringVariation = false;
        jumpToMoveUniversal(state.deviationIndex - 1, state.loadedGameMoves);
        state.deviationIndex = null;
    }
});

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('play-move-link')) {
        e.preventDefault();
        const moveSan = e.target.getAttribute('data-move');
        if (moveSan && moveSan !== '-') {
            try {
                playMoveSan(moveSan);
            } catch (err) {
                console.error("Could not play move", moveSan, err);
            }
        }
    }
});

elements.copyPgnBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(state.game.pgn()).then(() => {
        const originalIcon = elements.copyPgnBtn.innerHTML;
        elements.copyPgnBtn.innerHTML = '<span class="material-icons" style="font-size: 14px; color: #4caf50;">check</span>';
        setTimeout(() => {
            elements.copyPgnBtn.innerHTML = originalIcon;
        }, 2000);
    });
});

elements.plotGraphBtn.addEventListener('click', function() {
    const pgnText = elements.pgnInput.value.trim() || state.game.pgn();
    plotGameMetrics(pgnText, this);
});

// Initialize Application
initBoard();
updateStatus();
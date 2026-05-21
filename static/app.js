import { Chessground } from 'https://unpkg.com/chessground@9.2.1/dist/chessground.min.js';

const elements = {
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    opening: document.getElementById('opening'),
    evalScore: document.getElementById('eval-score'),
    evalFill: document.getElementById('eval-fill'),
    bestMove: document.getElementById('best-move'),
    loading: document.getElementById('loading'),
    pgn: document.getElementById('pgn'),
    classification: document.getElementById('classification'),
    accuracyResults: document.getElementById('accuracy-results'),
    topPlayer: document.getElementById('board-top-player'),
    bottomPlayer: document.getElementById('board-bottom-player'),
    pgnInput: document.getElementById('pgn-input'),
    fetchGamesList: document.getElementById('fetched-games-list'),
    plotGraphBtn: document.getElementById('plot-graph-btn'),
    plotLoading: document.getElementById('plot-loading'),
    analysisPlot: document.getElementById('analysis-plot')
};

let game = new Chess();
let board = null; // Chessground instance
let currentFullPGN = "";
let loadedGameMoves = [];
let currentMoveIndex = 0;
let prevCp = null;
let prevMate = null;
let isAnalyzing = false;
let currentThreats = [];
let whitePlayerString = "White: -";
let blackPlayerString = "Black: -";

function getLegalMoves(chessGame) {
    const dests = new Map();
    chessGame.SQUARES.forEach(s => {
        const moves = chessGame.moves({ square: s, verbose: true });
        if (moves.length) dests.set(s, moves.map(m => m.to));
    });
    return dests;
}

function initBoard() {
    board = Chessground(elements.board, {
        fen: game.fen(),
        orientation: 'white',
        turnColor: 'white',
        movable: {
            color: 'white',
            free: false,
            dests: getLegalMoves(game),
            events: { after: onDrop }
        },
        drawable: { enabled: true, visible: true }
    });
}

function onDrop(orig, dest) {
    const move = game.move({ from: orig, to: dest, promotion: 'q' });
    
    if (move === null) {
        board.set({ fen: game.fen() }); // Snapback
        return;
    }
    
    loadedGameMoves = [];
    currentMoveIndex = 0;
    currentFullPGN = game.pgn();
    
    updateBoardState();
    debouncedAnalyzePosition();
}

function updateBoardState() {
    board.set({
        fen: game.fen(),
        turnColor: game.turn() === 'w' ? 'white' : 'black',
        movable: {
            color: game.turn() === 'w' ? 'white' : 'black',
            dests: getLegalMoves(game)
        },
        drawable: { shapes: [] } // Clear arrows on move
    });
    updateStatus();
}

function updateStatus() {
    let statusHTML = '';
    const moveColor = game.turn() === 'w' ? 'White' : 'Black';

    if (game.in_checkmate()) statusHTML = `Game over, ${moveColor} is in checkmate.`;
    else if (game.in_draw()) statusHTML = 'Game over, drawn position';
    else {
        statusHTML = `${moveColor} to move`;
        if (game.in_check()) statusHTML += `, ${moveColor} is in check`;
    }
    
    elements.status.textContent = statusHTML;
    elements.pgn.textContent = game.pgn() || '-';
    elements.pgn.scrollTop = elements.pgn.scrollHeight;
}

function updatePlayerOrientation() {
    const isWhiteBottom = board.state.orientation === 'white';
    elements.topPlayer.textContent = isWhiteBottom ? blackPlayerString : whitePlayerString;
    elements.bottomPlayer.textContent = isWhiteBottom ? whitePlayerString : blackPlayerString;
}

let analysisTimeout = null;
let currentAnalysisFen = null;
const analysisCache = new Map();
let currentAbortController = null;

function displayAnalysis(data, fen) {
    if (game.fen() !== fen) return;

    prevCp = data.raw_cp ?? null;
    prevMate = data.mate ?? null;
    currentThreats = data.threats || [];

    if (data.opening && data.opening !== 'Unknown Opening') {
        elements.opening.textContent = data.opening;
    }

    if (data.category) {
        let catHTML = data.category;
        if (data.accuracy !== null) catHTML += ` <span style="font-size:0.8em; color:#888;">(${data.accuracy.toFixed(1)}%)</span>`;
        
        let catColor = '#e0e0e0';
        if (data.category === 'Book Move') catColor = '#a87ca0';
        else if (['Best Move', 'Excellent'].includes(data.category)) catColor = '#4caf50';
        else if (data.category === 'Good') catColor = '#8bc34a';
        else if (data.category === 'Inaccuracy') catColor = '#ffc107';
        else if (data.category === 'Mistake') catColor = '#ff9800';
        else if (data.category === 'Blunder') catColor = '#f44336';
        
        elements.classification.innerHTML = catHTML;
        elements.classification.style.color = catColor;
    } else {
        elements.classification.innerHTML = '-';
        elements.classification.style.color = '#e0e0e0';
    }

    let evalText = '0.00';
    let evalWidth = 50;
    
    if (data.mate !== null && data.mate !== undefined) {
        evalText = `M${Math.abs(data.mate)}`;
        if (data.mate > 0) { evalWidth = 100; evalText = `+${evalText}`; }
        else { evalWidth = 0; evalText = `-${evalText}`; }
    } else if (data.score !== null && data.score !== undefined) {
        evalText = (data.score > 0 ? '+' : '') + data.score.toFixed(2);
        evalWidth = 50 + (Math.max(-5, Math.min(5, data.score)) * 10);
    }
    
    elements.evalScore.textContent = evalText;
    elements.evalFill.style.width = `${evalWidth}%`;

    let expectedBestMove = data.best_move || '-';
    elements.bestMove.textContent = expectedBestMove;
}

function debouncedAnalyzePosition() {
    clearTimeout(analysisTimeout);
    elements.loading.classList.remove('hidden');
    elements.classification.innerHTML = '-';
    elements.classification.style.color = '#e0e0e0';
    elements.bestMove.textContent = '-';
    analysisTimeout = setTimeout(() => analyzePosition(), 400);
}

async function analyzePosition() {
    const fen = game.fen();
    currentAnalysisFen = fen;
    
    if (analysisCache.has(fen)) {
        displayAnalysis(analysisCache.get(fen), fen);
        elements.loading.classList.add('hidden');
        return;
    }
    
    let tempPrevCp = null;
    let tempPrevMate = null;
    const history = game.history();
    if (history.length > 0) {
        let tempGame = new Chess();
        tempGame.load_pgn(game.pgn());
        tempGame.undo();
        let pFen = tempGame.fen();
        if (analysisCache.has(pFen)) {
            let pData = analysisCache.get(pFen);
            tempPrevCp = pData.raw_cp !== undefined ? pData.raw_cp : null;
            tempPrevMate = pData.mate !== undefined ? pData.mate : null;
        }
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    
    try {
        const response = await fetch('/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, prev_cp: tempPrevCp, prev_mate: tempPrevMate }),
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

document.getElementById('reset-btn').addEventListener('click', () => {
    game.reset();
    currentFullPGN = "";
    loadedGameMoves = [];
    currentMoveIndex = 0;
    prevCp = null;
    prevMate = null;
    
    whitePlayerString = 'White: -';
    blackPlayerString = 'Black: -';
    
    updateBoardState();
    updatePlayerOrientation();
    elements.opening.textContent = 'Starting Position';
    elements.evalScore.textContent = '0.00';
    elements.evalFill.style.width = '50%';
    elements.bestMove.textContent = '-';
    elements.classification.innerHTML = '-';
    elements.classification.style.color = '#e0e0e0';
    elements.accuracyResults.classList.add('hidden');
});

document.getElementById('prev-btn').addEventListener('click', () => {
    if (game.history().length === 0) return;
    game.undo();
    if (currentMoveIndex > 0) currentMoveIndex--;
    
    updateBoardState();
    if (game.history().length > 0) debouncedAnalyzePosition();
    else {
        elements.opening.textContent = 'Starting Position';
        elements.evalScore.textContent = '0.00';
        elements.evalFill.style.width = '50%';
        elements.bestMove.textContent = '-';
    }
});

document.getElementById('next-btn').addEventListener('click', () => {
    if (currentMoveIndex < loadedGameMoves.length) {
        game.move(loadedGameMoves[currentMoveIndex]);
        currentMoveIndex++;
        updateBoardState();
        debouncedAnalyzePosition();
    }
});

document.getElementById('flip-btn').addEventListener('click', () => {
    board.set({ orientation: board.state.orientation === 'white' ? 'black' : 'white' });
    updatePlayerOrientation();
});

document.getElementById('threats-btn').addEventListener('click', () => {
    const shapes = currentThreats.map(t => ({
        orig: t.from,
        dest: t.to,
        brush: 'red'
    }));
    board.set({ drawable: { shapes: shapes } });
});

document.getElementById('load-pgn-btn').addEventListener('click', () => {
    const pgnText = elements.pgnInput.value.trim();
    if (!pgnText) return;
    
    let tempGame = new Chess();
    if (tempGame.load_pgn(pgnText)) {
        currentFullPGN = tempGame.pgn();
        loadedGameMoves = tempGame.history();
        currentMoveIndex = 0;
        
        const headers = tempGame.header();
        const wElo = headers.WhiteElo && headers.WhiteElo !== '?' ? ` (${headers.WhiteElo})` : '';
        const bElo = headers.BlackElo && headers.BlackElo !== '?' ? ` (${headers.BlackElo})` : '';
        whitePlayerString = `White: ${headers.White || 'Unknown'}${wElo}`;
        blackPlayerString = `Black: ${headers.Black || 'Unknown'}${bElo}`;
        
        game.reset();
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

async function runOverallAccuracy(pgnString, btnElement) {
    if (!pgnString || pgnString.trim() === "") return alert("No moves found to analyze!");
    
    const originalText = btnElement.textContent;
    btnElement.textContent = 'Calculating...';
    btnElement.disabled = true;
    elements.accuracyResults.classList.add('hidden');

    try {
        const response = await fetch('/analyze_full_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnString })
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

document.getElementById('calc-board-accuracy-btn').addEventListener('click', function() {
    if (!game.pgn()) return alert("No moves played on the board yet!");
    runOverallAccuracy(game.pgn(), this);
});

document.getElementById('calc-pgn-accuracy-btn').addEventListener('click', function() {
    const pgnText = elements.pgnInput.value.trim();
    if (!pgnText) return alert("Please paste a PGN or fetch a game first!");
    runOverallAccuracy(pgnText, this);
});

elements.plotGraphBtn.addEventListener('click', async function() {
    const pgnText = elements.pgnInput.value.trim() || game.pgn();
    if (!pgnText) return alert("Please paste a PGN, fetch a game, or play some moves first!");
    
    const originalText = this.textContent;
    this.textContent = 'Generating plot...';
    this.disabled = true;
    elements.plotLoading.classList.remove('hidden');
    elements.analysisPlot.style.display = 'none';

    try {
        const response = await fetch('/plot_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnText })
        });
        
        const data = await response.json();
        if (data.detail) throw new Error("Validation Error: " + JSON.stringify(data.detail));
        if (data.error) throw new Error(data.error);
        if (!data.image) throw new Error("Invalid response format. Data received: " + JSON.stringify(data).substring(0, 100));

        elements.analysisPlot.src = "data:image/png;base64," + data.image;
        elements.analysisPlot.style.display = 'block';
    } catch (e) {
        alert("Plot generation failed: " + e.message);
    } finally {
        this.textContent = originalText;
        this.disabled = false;
        elements.plotLoading.classList.add('hidden');
    }
});

initBoard();
updateStatus();
import { Chessground } from 'https://unpkg.com/chessground@9.2.1/dist/chessground.min.js';

const elements = {
    board: document.getElementById('board'),
    status: document.getElementById('status'),
    opening: document.getElementById('opening'),
    evalScore: document.getElementById('eval-score'),
    evalFill: document.getElementById('eval-fill'),
    classification: document.getElementById('classification'),
    bestMove: document.getElementById('best-move'),
    loading: document.getElementById('eval-loading'),
    pgnGrid: document.getElementById('pgn-grid'),
    deviationBanner: document.getElementById('deviation-banner'),
    returnMainlineBtn: document.getElementById('return-mainline-btn'),
    copyPgnBtn: document.getElementById('copy-pgn-btn'),
    accuracyResults: document.getElementById('accuracy-results'),
    engineDepth: document.getElementById('engine-depth'),
    engineTime: document.getElementById('engine-time'),
    topPlayer: document.getElementById('board-top-player'),
    bottomPlayer: document.getElementById('board-bottom-player'),
    pgnInput: document.getElementById('pgn-input'),
    fetchGamesList: document.getElementById('fetched-games-list'),
    plotGraphBtn: document.getElementById('plot-graph-btn'),
    plotLoading: document.getElementById('plot-loading'),
    evalChart: document.getElementById('eval-chart'),
    metricsChart: document.getElementById('metrics-chart')
};

let game = new Chess();
let board = null; // Chessground instance
let currentFullPGN = "";
let loadedGameMoves = [];
let variationMoves = [];
let isExploringVariation = false;
let deviationIndex = null;
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
    const moves = game.moves({ verbose: true });
    let chosenMove = moves.find(m => m.from === orig && m.to === dest && (!m.promotion || m.promotion === 'q'));
    
    if (!chosenMove) {
        board.set({ fen: game.fen() }); // Snapback
        return;
    }
    
    let moveSan = chosenMove.san;

    if (!isExploringVariation && loadedGameMoves.length > 0 && currentMoveIndex < loadedGameMoves.length) {
        if (moveSan !== loadedGameMoves[currentMoveIndex]) {
            // Diverged!
            isExploringVariation = true;
            deviationIndex = currentMoveIndex;
            game.move(moveSan);
            variationMoves = game.history();
            currentMoveIndex++;
        } else {
            // Matched mainline
            game.move(moveSan);
            currentMoveIndex++;
        }
    } else {
        game.move(moveSan);
        if (isExploringVariation) {
            variationMoves = game.history();
        } else {
            // No loaded game, just regular play
            loadedGameMoves = game.history();
        }
        currentMoveIndex++;
    }
    
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
    renderPGNGrid();
}

function renderPGNGrid() {
    elements.pgnGrid.innerHTML = '';
    
    let movesToRender = [];
    if (!isExploringVariation && loadedGameMoves.length > 0) {
        movesToRender = loadedGameMoves;
    } else if (isExploringVariation) {
        movesToRender = variationMoves;
    } else {
        movesToRender = loadedGameMoves;
    }

    if (isExploringVariation) {
        elements.deviationBanner.classList.remove('hidden');
    } else {
        elements.deviationBanner.classList.add('hidden');
    }

    let rowDiv = null;
    for (let i = 0; i < movesToRender.length; i++) {
        if (i % 2 === 0) {
            rowDiv = document.createElement('div');
            rowDiv.className = 'pgn-row';
            
            const numDiv = document.createElement('div');
            numDiv.className = 'pgn-num';
            numDiv.textContent = Math.floor(i/2) + 1;
            rowDiv.appendChild(numDiv);
            
            elements.pgnGrid.appendChild(rowDiv);
        }

        const moveDiv = document.createElement('div');
        moveDiv.className = 'pgn-move';
        
        if (isExploringVariation && deviationIndex !== null && i >= deviationIndex) {
            moveDiv.classList.add('variation');
        }
        
        if (i === currentMoveIndex - 1) {
            moveDiv.classList.add('active');
        }
        moveDiv.textContent = movesToRender[i];
        
        moveDiv.addEventListener('click', () => {
            if (isExploringVariation) {
                jumpToMoveUniversal(i, variationMoves);
            } else {
                jumpToMoveUniversal(i, loadedGameMoves);
            }
        });

        if (rowDiv) rowDiv.appendChild(moveDiv);
    }
    
    const activeElement = elements.pgnGrid.querySelector('.active');
    if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

const categoryStyles = {
    'Brilliant': { class: 'badge-brilliant', icon: 'verified' },
    'Great Move': { class: 'badge-great', icon: 'stars' },
    'Best Move': { class: 'badge-best', icon: 'star' },
    'Excellent': { class: 'badge-excellent', icon: 'thumb_up' },
    'Good': { class: 'badge-good', icon: 'check' },
    'Book Move': { class: 'badge-book', icon: 'menu_book' },
    'Inaccuracy': { class: 'badge-inaccuracy', icon: 'priority_high' },
    'Mistake': { class: 'badge-mistake', icon: 'question_mark' },
    'Blunder': { class: 'badge-blunder', icon: 'close' },
};

function drawBadge(square, category) {
    let layer = document.getElementById('annotations-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'annotations-layer';
        layer.style.position = 'absolute';
        layer.style.top = '0';
        layer.style.left = '0';
        layer.style.width = '100%';
        layer.style.height = '100%';
        layer.style.pointerEvents = 'none';
        layer.style.zIndex = '9';
        const cgWrap = document.getElementById('board');
        if (cgWrap) cgWrap.appendChild(layer);
    }
    layer.innerHTML = ''; // clear previous

    if (!square || !category || !categoryStyles[category]) return;

    const style = categoryStyles[category];
    const file = square.charCodeAt(0) - 97;
    const rank = parseInt(square[1]) - 1;

    let orientation = 'white';
    try {
        if (board && board.state && board.state.orientation) {
            orientation = board.state.orientation;
        } else {
            orientation = game.turn() === 'w' ? 'white' : 'black';
        }
    } catch(e) {}

    let leftPct, topPct;
    if (orientation === 'white') {
        leftPct = file * 12.5;
        topPct = (7 - rank) * 12.5;
    } else {
        leftPct = (7 - file) * 12.5;
        topPct = rank * 12.5;
    }

    const squareDiv = document.createElement('div');
    squareDiv.className = 'annotation-square';
    squareDiv.style.left = leftPct + '%';
    squareDiv.style.top = topPct + '%';

    const badge = document.createElement('div');
    badge.className = `annotation-badge material-icons ${style.class}`;
    badge.textContent = style.icon;

    squareDiv.appendChild(badge);
    layer.appendChild(squareDiv);
}

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
        
        // Draw badge for the last move
        const history = game.history({ verbose: true });
        if (history.length > 0) {
            const lastMove = history[history.length - 1];
            drawBadge(lastMove.to, data.category);
        }
    } else {
        elements.classification.innerHTML = '-';
        elements.classification.style.color = '#e0e0e0';
        drawBadge(null, null); // clear
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
    elements.evalScore.style.opacity = '1';
    elements.evalFill.style.opacity = '1';

    let expectedBestMove = data.best_move || '-';
    elements.bestMove.textContent = expectedBestMove;
}

function debouncedAnalyzePosition() {
    clearTimeout(analysisTimeout);
    elements.loading.classList.remove('hidden');
    elements.classification.innerHTML = '-';
    elements.classification.style.color = '#e0e0e0';
    elements.bestMove.textContent = '-';
    elements.evalScore.style.opacity = '0.5';
    elements.evalFill.style.opacity = '0.5';
    analysisTimeout = setTimeout(() => analyzePosition(), 400);
}

elements.engineDepth.addEventListener('change', () => {
    analysisCache.clear();
    debouncedAnalyzePosition();
});
elements.engineTime.addEventListener('change', () => {
    analysisCache.clear();
    debouncedAnalyzePosition();
});

async function analyzePosition() {
    const fen = game.fen();
    currentAnalysisFen = fen;
    
    if (analysisCache.has(fen)) {
        displayAnalysis(analysisCache.get(fen), fen);
        elements.loading.classList.add('hidden');
        return;
    }
    
    let tempPrevFen = null;
    const history = game.history();
    if (history.length > 0) {
        let tempGame = new Chess();
        tempGame.load_pgn(game.pgn());
        tempGame.undo();
        tempPrevFen = tempGame.fen();
    }

    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    
    try {
        const depth = parseInt(elements.engineDepth.value) || 15;
        const timeLimit = parseFloat(elements.engineTime.value) || 0.5;
        
        const response = await fetch('/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, prev_fen: tempPrevFen, depth: depth, time: timeLimit }),
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
    isExploringVariation = false;
    variationMoves = [];
    deviationIndex = null;
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
    drawBadge(null, null);
});

function jumpToMoveUniversal(index, sourceMoves) {
    if (sourceMoves.length === 0 || index >= sourceMoves.length) {
        if (index === -1) {
            game.reset();
            currentMoveIndex = 0;
        }
    } else {
        game.reset();
        for (let i = 0; i <= index; i++) {
            game.move(sourceMoves[i]);
        }
        currentMoveIndex = index + 1;
    }
    
    updateBoardState();
    debouncedAnalyzePosition();
}

document.getElementById('prev-btn').addEventListener('click', () => {
    const source = isExploringVariation ? variationMoves : loadedGameMoves;
    if (currentMoveIndex > 0) {
        jumpToMoveUniversal(currentMoveIndex - 2, source);
    }
});

document.getElementById('next-btn').addEventListener('click', () => {
    const source = isExploringVariation ? variationMoves : loadedGameMoves;
    if (currentMoveIndex < source.length) {
        jumpToMoveUniversal(currentMoveIndex, source);
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
        isExploringVariation = false;
        variationMoves = [];
        deviationIndex = null;
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
        const depth = parseInt(elements.engineDepth.value) || 15;
        const timeLimit = parseFloat(elements.engineTime.value) || 0.5;
        
        const response = await fetch('/analyze_full_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnString, depth: depth, time_limit: timeLimit })
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

let evalChartInstance = null;
let metricsChartInstance = null;

function jumpToMove(index) {
    if (isExploringVariation) {
        // If they click on graph, they expect to jump to the mainline graph
        isExploringVariation = false;
        deviationIndex = null;
    }
    jumpToMoveUniversal(index, loadedGameMoves);
}

elements.returnMainlineBtn.addEventListener('click', () => {
    if (deviationIndex !== null) {
        isExploringVariation = false;
        jumpToMoveUniversal(deviationIndex - 1, loadedGameMoves);
        deviationIndex = null;
    }
});

elements.copyPgnBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(game.pgn()).then(() => {
        const originalIcon = elements.copyPgnBtn.innerHTML;
        elements.copyPgnBtn.innerHTML = '<span class="material-icons" style="font-size: 14px; color: #4caf50;">check</span>';
        setTimeout(() => {
            elements.copyPgnBtn.innerHTML = originalIcon;
        }, 2000);
    });
});

elements.plotGraphBtn.addEventListener('click', async function() {
    const pgnText = elements.pgnInput.value.trim() || game.pgn();
    if (!pgnText) return alert("Please paste a PGN, fetch a game, or play some moves first!");
    
    // Ensure loadedGameMoves is up to date with the plotted PGN
    let tempGame = new Chess();
    if (tempGame.load_pgn(pgnText)) {
        loadedGameMoves = tempGame.history();
    }
    
    const originalText = this.textContent;
    this.textContent = 'Generating plot...';
    this.disabled = true;
    elements.plotLoading.classList.remove('hidden');
    elements.evalChart.style.display = 'none';
    elements.metricsChart.style.display = 'none';

    try {
        const response = await fetch('/plot_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnText })
        });
        
        const data = await response.json();
        if (data.detail) throw new Error("Validation Error: " + JSON.stringify(data.detail));
        if (data.error) throw new Error(data.error);
        if (!data.metrics) throw new Error("Invalid response format.");

        const metrics = data.metrics;
        const timeline_fragility = [];
        const timeline_think_time = [];
        const wp_timeline = metrics.absolute_white_wp_timeline || [];
        const labels = [];
        
        const white_f = metrics.white.fragility_history || [];
        const black_f = metrics.black.fragility_history || [];
        const white_t = metrics.white.human_think_times || [];
        const black_t = metrics.black.human_think_times || [];
        
        let w_idx = 0, b_idx = 0;
        const total_turns = white_f.length + black_f.length;
        
        for (let i = 0; i < total_turns; i++) {
            if (i % 2 === 0 && w_idx < white_f.length) {
                timeline_fragility.push(white_f[w_idx]);
                timeline_think_time.push(white_t[w_idx]);
                labels.push(`${w_idx + 1}W`);
                w_idx++;
            } else if (b_idx < black_f.length) {
                timeline_fragility.push(black_f[b_idx]);
                timeline_think_time.push(black_t[b_idx]);
                labels.push(`${b_idx + 1}B`);
                b_idx++;
            }
        }
        
        const clipped_wp = wp_timeline.slice(0, labels.length);
        
        // Define phase annotation lines based on available moves
        const annotations = {
            zeroLine: {
                type: 'line',
                yMin: 50,
                yMax: 50,
                borderColor: 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderDash: [5, 5],
                label: { display: true, content: '0', position: 'start', backgroundColor: 'rgba(0,0,0,0.5)', color: '#fff', font: {size: 10} }
            }
        };
        
        if (labels.length > 30) {
            annotations.openingLine = {
                type: 'line',
                xMin: 30,
                xMax: 30,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1,
                label: { display: true, content: 'Middlegame', position: 'start', rotation: 90, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)', yAdjust: 40 }
            };
        }
        
        if (labels.length > 80) {
            annotations.endgameLine = {
                type: 'line',
                xMin: 80,
                xMax: 80,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1,
                label: { display: true, content: 'Endgame', position: 'start', rotation: 90, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)', yAdjust: 40 }
            };
        }

        if (evalChartInstance) evalChartInstance.destroy();
        if (metricsChartInstance) metricsChartInstance.destroy();

        const ctxEval = elements.evalChart.getContext('2d');
        const ctxMetrics = elements.metricsChart.getContext('2d');
        
        elements.evalChart.style.display = 'block';
        elements.metricsChart.style.display = 'block';

        const commonOptions = {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const idx = activeElements[0].index;
                    jumpToMove(idx);
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        title: (context) => {
                            const index = context[0].dataIndex;
                            const move = loadedGameMoves[index];
                            return `${context[0].label}: ${move || ''}`;
                        }
                    }
                }
            }
        };

        evalChartInstance = new Chart(ctxEval, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Advantage',
                    data: clipped_wp,
                    borderColor: '#ff6b00',
                    backgroundColor: 'rgba(150, 150, 150, 0.4)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    yAxisID: 'y',
                    tension: 0.1
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: { ticks: { color: '#aaaaaa', maxTicksLimit: 20 }, grid: { color: '#333333' } },
                    y: {
                        type: 'linear', display: true, position: 'left', min: 0, max: 100,
                        title: { display: false }, grid: { color: '#333333' }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    annotation: { annotations: annotations }
                }
            }
        });

        metricsChartInstance = new Chart(ctxMetrics, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Fragility (Tension)',
                        data: timeline_fragility,
                        borderColor: '#d62728',
                        backgroundColor: '#d62728',
                        yAxisID: 'y1',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3
                    },
                    {
                        label: 'Think Time (sec)',
                        data: timeline_think_time,
                        borderColor: '#1f77b4',
                        backgroundColor: '#1f77b4',
                        yAxisID: 'y2',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointStyle: 'rect',
                        pointRadius: 2,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: { ticks: { color: '#aaaaaa', maxTicksLimit: 20 }, grid: { color: '#333333' } },
                    y1: {
                        type: 'linear', display: true, position: 'left', min: 0,
                        title: { display: true, text: 'Tension', color: '#d62728' }, grid: { color: '#333333' }
                    },
                    y2: {
                        type: 'linear', display: true, position: 'right', min: 0,
                        title: { display: true, text: 'Time (s)', color: '#1f77b4' }, grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    annotation: {
                        annotations: {
                            ...(labels.length > 30 ? { openingLine: annotations.openingLine } : {}),
                            ...(labels.length > 80 ? { endgameLine: annotations.endgameLine } : {})
                        }
                    }
                }
            }
        });
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
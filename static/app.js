let board = null;
let game = new Chess();
let isAnalyzing = false;

const $status = $('#status');
const $opening = $('#opening');
const $evalScore = $('#eval-score');
const $evalFill = $('#eval-fill');
const $bestMove = $('#best-move');
const $loading = $('#loading');
const $pgn = $('#pgn');
const $classification = $('#classification');

let prevCp = null;
let prevMate = null;
let isRightClick = false;

document.addEventListener('mousedown', e => { if (e.button === 2) isRightClick = true; }, true);
document.addEventListener('mouseup', e => { if (e.button === 2) isRightClick = false; }, true);

function onDragStart(source, piece, position, orientation) {
    if (isRightClick || game.game_over()) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) || (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    
    loadedGameMoves = [];
    currentMoveIndex = 0;
    
    clearArrows(false);
    updateStatus();
    debouncedAnalyzePosition();
}

function onSnapEnd() { board.position(game.fen()); }

function updateStatus() {
    let statusHTML = '';
    let moveColor = (game.turn() === 'w') ? 'White' : 'Black';
    if (game.in_checkmate()) statusHTML = 'Game over, ' + moveColor + ' is in checkmate.';
    else if (game.in_draw()) statusHTML = 'Game over, drawn position';
    else {
        statusHTML = moveColor + ' to move';
        if (game.in_check()) statusHTML += ', ' + moveColor + ' is in check';
    }
    $status.text(statusHTML);
    $pgn.text(game.pgn() || '-');
    $pgn.scrollTop($pgn[0].scrollHeight);
}

let analysisTimeout = null;
let currentAnalysisFen = null;
const analysisCache = new Map();
let currentAbortController = null;

function displayAnalysis(data, fen) {
    if (game.fen() !== fen) return;
    prevCp = data.raw_cp !== undefined ? data.raw_cp : null;
    prevMate = data.mate !== undefined ? data.mate : null;
    currentThreats = data.threats || [];
    
    if (data.opening && data.opening !== 'Unknown Opening') {
        $opening.text(data.opening);
    }

    if (data.category) {
        let catHTML = data.category;
        if (data.accuracy !== null) catHTML += ` <span style="font-size:0.8em; color:#888;">(${data.accuracy.toFixed(1)}%)</span>`;
        let catColor = '#e0e0e0';
        if (data.category === 'Book Move') catColor = '#a87ca0';
        else if (data.category === 'Best Move' || data.category === 'Excellent') catColor = '#4caf50';
        else if (data.category === 'Good') catColor = '#8bc34a';
        else if (data.category === 'Inaccuracy') catColor = '#ffc107';
        else if (data.category === 'Mistake') catColor = '#ff9800';
        else if (data.category === 'Blunder') catColor = '#f44336';
        $classification.html(catHTML).css('color', catColor);
    } else {
        $classification.html('-').css('color', '#e0e0e0');
    }

    let evalText = '';
    let evalWidth = 50;
    if (data.mate !== null && data.mate !== undefined) {
        evalText = 'M' + Math.abs(data.mate);
        if (data.mate > 0) { evalWidth = 100; evalText = '+' + evalText; } 
        else { evalWidth = 0; evalText = '-' + evalText; }
    } else if (data.score !== null && data.score !== undefined) {
        evalText = (data.score > 0 ? '+' : '') + data.score.toFixed(2);
        evalWidth = 50 + (Math.max(-5, Math.min(5, data.score)) * 10);
    } else {
        evalText = '0.00';
        evalWidth = 50;
    }
    $evalScore.text(evalText);
    $evalFill.css('width', evalWidth + '%');

    let expectedBestMove = data.best_move || '-';
    $bestMove.text(expectedBestMove);
}

function debouncedAnalyzePosition() {
    clearTimeout(analysisTimeout);
    $loading.removeClass('hidden');
    $classification.html('-').css('color', '#e0e0e0');
    $bestMove.text('-');
    analysisTimeout = setTimeout(() => analyzePosition(), 400);
}

async function analyzePosition() {
    const fen = game.fen();
    currentAnalysisFen = fen;
    if (analysisCache.has(fen)) {
        displayAnalysis(analysisCache.get(fen), fen);
        isAnalyzing = false;
        $loading.addClass('hidden');
        return;
    }
    
    // Get proper prevCp from cache if available
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
    } else {
        tempPrevCp = null;
        tempPrevMate = null;
    }

    isAnalyzing = true;
    $loading.removeClass('hidden');
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    try {
        const response = await fetch('/evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: fen, prev_cp: tempPrevCp, prev_mate: tempPrevMate }),
            signal: currentAbortController.signal
        });
        if (!response.ok) return;
        const data = await response.json();
        if (currentAnalysisFen !== fen) return;
        analysisCache.set(fen, data);
        displayAnalysis(data, fen);
    } catch (error) {
    } finally {
        if (currentAnalysisFen === fen) {
            isAnalyzing = false;
            $loading.addClass('hidden');
        }
    }
}

let loadedGameMoves = [];
let currentMoveIndex = 0;
let whitePlayerString = "White: -";
let blackPlayerString = "Black: -";

function updatePlayerOrientation() {
    if (board.orientation() === 'white') {
        $('#board-top-player').text(blackPlayerString);
        $('#board-bottom-player').text(whitePlayerString);
    } else {
        $('#board-top-player').text(whitePlayerString);
        $('#board-bottom-player').text(blackPlayerString);
    }
}

$('#reset-btn').on('click', () => {
    game.reset();
    board.start();
    updateStatus();
    prevCp = null;
    prevMate = null;
    loadedGameMoves = [];
    currentMoveIndex = 0;
    clearArrows(false);
    whitePlayerString = 'White: -';
    blackPlayerString = 'Black: -';
    updatePlayerOrientation();
    $opening.text('Starting Position');
    $evalScore.text('0.00');
    $evalFill.css('width', '50%');
    $bestMove.text('-');
    $classification.html('-').css('color', '#e0e0e0');
    $('#accuracy-results').addClass('hidden');
});

$('#prev-btn').on('click', () => {
    if (game.history().length === 0) return;
    game.undo();
    if (currentMoveIndex > 0) currentMoveIndex--;
    board.position(game.fen());
    updateStatus();
    prevCp = null;
    prevMate = null;
    clearArrows(false);
    $classification.html('-').css('color', '#e0e0e0');
    if (game.history().length > 0) debouncedAnalyzePosition();
    else {
        $opening.text('Starting Position');
        $evalScore.text('0.00');
        $evalFill.css('width', '50%');
        $bestMove.text('-');
    }
});

$('#next-btn').on('click', () => {
    if (currentMoveIndex < loadedGameMoves.length) {
        clearArrows(false);
        game.move(loadedGameMoves[currentMoveIndex]);
        currentMoveIndex++;
        board.position(game.fen());
        updateStatus();
        debouncedAnalyzePosition();
    }
});

$('#flip-btn').on('click', () => {
    board.flip();
    updatePlayerOrientation();
    clearArrows(false);
});

$('#load-pgn-btn').on('click', () => {
    const pgnText = $('#pgn-input').val().trim();
    if (!pgnText) return;
    let tempGame = new Chess();
    if (tempGame.load_pgn(pgnText)) {
        loadedGameMoves = tempGame.history();
        currentMoveIndex = 0;
        const headers = tempGame.header();
        const wElo = headers.WhiteElo && headers.WhiteElo !== '?' ? ` (${headers.WhiteElo})` : '';
        const bElo = headers.BlackElo && headers.BlackElo !== '?' ? ` (${headers.BlackElo})` : '';
        whitePlayerString = `White: ${headers.White || 'Unknown'}${wElo}`;
        blackPlayerString = `Black: ${headers.Black || 'Unknown'}${bElo}`;
        updatePlayerOrientation();
        game.reset();
        board.start();
        updateStatus();
        prevCp = null;
        prevMate = null;
        clearArrows(false);
        $opening.text('Starting Position');
        $evalScore.text('0.00');
        $evalFill.css('width', '50%');
        $bestMove.text('-');
        $classification.html('-').css('color', '#e0e0e0');
        $('#accuracy-results').addClass('hidden');
    } else {
        alert("Invalid PGN format.");
    }
});

const config = {
    draggable: true,
    position: 'start',
    onDragStart: onDragStart,
    onDrop: onDrop,
    onSnapEnd: onSnapEnd,
    pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
};

board = Chessboard('board', config);
updateStatus();

let currentThreats = [];
let rightClickStartSq = null;

function initArrowCanvas() {
    $('#arrow-canvas').html(`<defs><marker id="head-arrow-green" orient="auto" markerWidth="4" markerHeight="4" refX="2" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#4caf50"></path></marker><marker id="head-arrow-red" orient="auto" markerWidth="4" markerHeight="4" refX="2" refY="5" viewBox="0 0 10 10"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#f44336"></path></marker></defs>`);
}
initArrowCanvas();

function drawArrow(fromSq, toSq, colorClass, isUserArrow = false) {
    const $from = $('#board .square-' + fromSq);
    const $to = $('#board .square-' + toSq);
    if (!$from.length || !$to.length) return;
    const fromPos = $from.position();
    const toPos = $to.position();
    const sqSize = $from.width();
    let x1 = fromPos.left + sqSize / 2;
    let y1 = fromPos.top + sqSize / 2;
    let x2 = toPos.left + sqSize / 2;
    let y2 = toPos.top + sqSize / 2;
    const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    if (len > 0) {
        const ratio = (len - sqSize * 0.4) / len;
        x2 = x1 + (x2 - x1) * ratio;
        y2 = y1 + (y2 - y1) * ratio;
    }
    const $line = $(document.createElementNS('http://www.w3.org/2000/svg', 'line'));
    $line.attr({ x1, y1, x2, y2, 'class': 'arrow-line ' + colorClass + (isUserArrow ? ' user-arrow' : ''), 'marker-end': `url(#head-${colorClass})` });
    $('#arrow-canvas').append($line);
}

function clearArrows(userOnly = false) {
    if (userOnly) $('#arrow-canvas .user-arrow').remove();
    else $('#arrow-canvas line').remove();
}

$('#board').on('contextmenu', e => e.preventDefault());
$('#board').on('mousedown', '.square-55d63', function(e) {
    if (e.button === 2) rightClickStartSq = $(this).attr('data-square');
    else if (e.button === 0) clearArrows();
});
$('#board').on('mouseup', '.square-55d63', function(e) {
    if (e.button === 2 && rightClickStartSq) {
        const toSq = $(this).attr('data-square');
        if (toSq && toSq !== rightClickStartSq) drawArrow(rightClickStartSq, toSq, 'arrow-green', true);
        rightClickStartSq = null;
    }
});

$('#threats-btn').on('click', () => {
    clearArrows(false);
    currentThreats.forEach(t => drawArrow(t.from, t.to, 'arrow-red', false));
});

$('#fetch-games-btn').on('click', async () => {
    const platform = $('#fetch-platform').val();
    const username = $('#fetch-username').val().trim();
    const time_format = $('#fetch-time').val();
    const $list = $('#fetched-games-list');
    const $btn = $('#fetch-games-btn');
    if (!username) return alert("Please enter a username.");
    $btn.text('Fetching...').prop('disabled', true);
    $list.empty();
    try {
        const res = await fetch(`/fetch_games?platform=${platform}&username=${username}&time_format=${time_format}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.games && data.games.length > 0) {
            data.games.forEach(g => {
                $list.append(`<div class="game-card" data-pgn="${encodeURIComponent(g.pgn)}"><strong>${g.white}</strong> vs <strong>${g.black}</strong> <span style="float:right;">${g.result}</span></div>`);
            });
            $('.game-card').on('click', function() {
                $('#pgn-input').val(decodeURIComponent($(this).attr('data-pgn')));
                $('#load-pgn-btn').click();
            });
        } else $list.html('<div style="color: #f44336; font-size: 0.85rem;">No games found.</div>');
    } catch (e) {
        $list.html('<div style="color: #f44336; font-size: 0.85rem;">Error fetching games.</div>');
    } finally {
        $btn.text('Fetch Games').prop('disabled', false);
    }
});

// ====== NEW DUAL ACCURACY LOGIC ======
async function runOverallAccuracy(pgnString, $btnElement) {
    if (!pgnString || pgnString.trim() === "") {
        return alert("No moves found to analyze!");
    }

    const $results = $('#accuracy-results');
    const originalText = $btnElement.text();
    
    $btnElement.text('Calculating...').prop('disabled', true);
    $results.addClass('hidden');

    try {
        const response = await fetch('/analyze_full_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnString })
        });
        
        const data = await response.json();
        
        if (data.error) throw new Error(data.error);
        if (data.detail) throw new Error(JSON.stringify(data.detail));
        if (!data.white || !data.black) throw new Error("Invalid response format.");

        $('#acc-w-overall').text(data.white.overall);
        $('#acc-w-op').text(data.white.opening);
        $('#acc-w-mid').text(data.white.middle);
        $('#acc-w-end').text(data.white.end);

        $('#acc-b-overall').text(data.black.overall);
        $('#acc-b-op').text(data.black.opening);
        $('#acc-b-mid').text(data.black.middle);
        $('#acc-b-end').text(data.black.end);

        $results.removeClass('hidden');
    } catch (e) {
        alert("Analysis failed: " + e.message);
    } finally {
        $btnElement.text(originalText).prop('disabled', false);
    }
}

$('#calc-board-accuracy-btn').on('click', function() {
    if (!game.pgn()) return alert("No moves played on the board yet!");
    runOverallAccuracy(game.pgn(), $(this));
});

$('#calc-pgn-accuracy-btn').on('click', function() {
    const pgnText = $('#pgn-input').val().trim();
    if (!pgnText) return alert("Please paste a PGN or fetch a game first!");
    runOverallAccuracy(pgnText, $(this));
});
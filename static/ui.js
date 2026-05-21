import { state, elements } from './state.js';
import { jumpToMoveUniversal } from './gameLogic.js';

export function updateStatus() {
    let statusHTML = '';
    const moveColor = state.game.turn() === 'w' ? 'White' : 'Black';

    if (state.game.in_checkmate()) statusHTML = `Game over, ${moveColor} is in checkmate.`;
    else if (state.game.in_draw()) statusHTML = 'Game over, drawn position';
    else {
        statusHTML = `${moveColor} to move`;
        if (state.game.in_check()) statusHTML += `, ${moveColor} is in check`;
    }
    
    elements.status.textContent = statusHTML;
    renderPGNGrid();
}

export function renderPGNGrid() {
    elements.pgnGrid.innerHTML = '';
    
    let movesToRender = [];
    if (!state.isExploringVariation && state.loadedGameMoves.length > 0) {
        movesToRender = state.loadedGameMoves;
    } else if (state.isExploringVariation) {
        movesToRender = state.variationMoves;
    } else {
        movesToRender = state.loadedGameMoves;
    }

    if (state.isExploringVariation) {
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
        
        if (state.isExploringVariation && state.deviationIndex !== null && i >= state.deviationIndex) {
            moveDiv.classList.add('variation');
        }
        
        if (i === state.currentMoveIndex - 1) {
            moveDiv.classList.add('active');
        }
        moveDiv.textContent = movesToRender[i];
        
        moveDiv.addEventListener('click', () => {
            if (state.isExploringVariation) {
                jumpToMoveUniversal(i, state.variationMoves);
            } else {
                jumpToMoveUniversal(i, state.loadedGameMoves);
            }
        });

        if (rowDiv) rowDiv.appendChild(moveDiv);
    }
    
    const activeElement = elements.pgnGrid.querySelector('.active');
    if (activeElement) {
        const container = elements.pgnGrid;
        const cRect = container.getBoundingClientRect();
        const eRect = activeElement.getBoundingClientRect();
        
        if (eRect.top < cRect.top || eRect.bottom > cRect.bottom) {
            container.scrollBy({
                top: eRect.top - cRect.top - (cRect.height / 2) + (eRect.height / 2),
                behavior: 'smooth'
            });
        }
    }
}

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

export function drawBadge(square, category) {
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
        if (state.board && state.board.state && state.board.state.orientation) {
            orientation = state.board.state.orientation;
        } else {
            orientation = state.game.turn() === 'w' ? 'white' : 'black';
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

export function displayAnalysis(data, fen) {
    if (state.game.fen() !== fen) return;

    state.prevCp = data.raw_cp ?? null;
    state.prevMate = data.mate ?? null;
    state.currentThreats = data.threats || [];

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
        
        if (data.prev_best_move && !['Best Move', 'Book Move'].includes(data.category)) {
            catHTML += `<br><span style="font-size:0.85em; color:#bbb;">Best was: <strong style="color: #64b5f6;">${data.prev_best_move}</strong></span>`;
        }
        
        elements.classification.innerHTML = catHTML;
        elements.classification.style.color = catColor;
        
        // Draw badge for the last move
        const history = state.game.history({ verbose: true });
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

import { Chessground } from 'https://unpkg.com/chessground@9.2.1/dist/chessground.min.js';
import { elements, state } from './state.js';
import { playMoveSan } from './gameLogic.js';
import { updateStatus } from './ui.js';

export function getLegalMoves(chessGame) {
    const dests = new Map();
    chessGame.SQUARES.forEach(s => {
        const moves = chessGame.moves({ square: s, verbose: true });
        if (moves.length) dests.set(s, moves.map(m => m.to));
    });
    return dests;
}

export function initBoard() {
    state.board = Chessground(elements.board, {
        fen: state.game.fen(),
        orientation: 'white',
        turnColor: 'white',
        movable: {
            color: 'white',
            free: false,
            dests: getLegalMoves(state.game),
            events: { after: onDrop }
        },
        drawable: { enabled: true, visible: true }
    });
}

function onDrop(orig, dest) {
    const moves = state.game.moves({ verbose: true });
    let chosenMove = moves.find(m => m.from === orig && m.to === dest && (!m.promotion || m.promotion === 'q'));
    
    if (!chosenMove) {
        state.board.set({ fen: state.game.fen() }); // Snapback
        return;
    }
    
    let moveSan = chosenMove.san;
    playMoveSan(moveSan);
}

export function updateBoardState() {
    state.board.set({
        fen: state.game.fen(),
        turnColor: state.game.turn() === 'w' ? 'white' : 'black',
        movable: {
            color: state.game.turn() === 'w' ? 'white' : 'black',
            dests: getLegalMoves(state.game)
        },
        drawable: { shapes: [] } // Clear arrows on move
    });
    updateStatus();
}

export function updatePlayerOrientation() {
    const isWhiteBottom = state.board.state.orientation === 'white';
    elements.topPlayer.textContent = isWhiteBottom ? state.blackPlayerString : state.whitePlayerString;
    elements.bottomPlayer.textContent = isWhiteBottom ? state.whitePlayerString : state.blackPlayerString;
}

import { state, elements } from './state.js?v=4';
import { updateBoardState, updatePlayerOrientation } from './board.js?v=4';
import { clearAnalysisCache, debouncedAnalyzePosition } from './api.js?v=4';

export function playMoveSan(moveSan) {
    if (!state.isExploringVariation && state.loadedGameMoves.length > 0 && state.currentMoveIndex < state.loadedGameMoves.length) {
        if (moveSan !== state.loadedGameMoves[state.currentMoveIndex]) {
            // Diverged!
            state.isExploringVariation = true;
            state.deviationIndex = state.currentMoveIndex;
            state.game.move(moveSan);
            state.variationMoves = state.game.history();
            state.currentMoveIndex++;
        } else {
            // Matched mainline
            state.game.move(moveSan);
            state.currentMoveIndex++;
        }
    } else {
        state.game.move(moveSan);
        if (state.isExploringVariation) {
            state.variationMoves = state.game.history();
        } else {
            // No loaded game, just regular play
            state.loadedGameMoves = state.game.history();
        }
        state.currentMoveIndex++;
    }
    
    updateBoardState();
    debouncedAnalyzePosition();
}

export function jumpToMoveUniversal(index, sourceMoves) {
    if (sourceMoves.length === 0 || index >= sourceMoves.length) {
        if (index === -1) {
            state.game.reset();
            state.currentMoveIndex = 0;
        }
    } else {
        state.game.reset();
        for (let i = 0; i <= index; i++) {
            state.game.move(sourceMoves[i]);
        }
        state.currentMoveIndex = index + 1;
    }
    
    updateBoardState();
    debouncedAnalyzePosition();
}

export function jumpToMove(index) {
    if (state.isExploringVariation) {
        state.isExploringVariation = false;
        state.deviationIndex = null;
    }
    jumpToMoveUniversal(index, state.loadedGameMoves);
}

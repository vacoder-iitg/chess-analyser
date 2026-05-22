import chess
import chess.engine
import chess.pgn
import io
import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'analyser'))
from game_engine import calculate_lichess_game_accuracy

def analyze_full_game(pgn_string, stockfish_path, depth=15, time_limit=0.5):
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_string))
        if not game:
            return {"error": "Failed to parse PGN."}

        engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        engine.configure({"Threads": 1, "Hash": 16})
        board = game.board()
        limit = chess.engine.Limit(depth=depth)

        info_before = engine.analyse(board, limit)
        cp_before = info_before["score"].pov(chess.WHITE).score(mate_score=10000)
        
        cp_timeline = [cp_before]
        
        for move in game.mainline_moves():
            board.push(move)
            info_after = engine.analyse(board, limit)
            cp_after = info_after["score"].pov(chess.WHITE).score(mate_score=10000)
            cp_timeline.append(cp_after)

        engine.quit()

        w_all, b_all = calculate_lichess_game_accuracy(cp_timeline)
        w_op, b_op = calculate_lichess_game_accuracy(cp_timeline[:31])
        w_mid, b_mid = calculate_lichess_game_accuracy(cp_timeline[30:81])
        w_end, b_end = calculate_lichess_game_accuracy(cp_timeline[80:])

        return {
            "white": {
                "overall": round(w_all, 1),
                "opening": round(w_op, 1),
                "middle": round(w_mid, 1),
                "end": round(w_end, 1)
            },
            "black": {
                "overall": round(b_all, 1),
                "opening": round(b_op, 1),
                "middle": round(b_mid, 1),
                "end": round(b_end, 1)
            }
        }
    except Exception as e:
        return {"error": f"Engine failed: {str(e)}"}
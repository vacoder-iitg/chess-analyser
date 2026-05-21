import chess
import chess.engine
import chess.pgn
import math
import statistics
import io

def cp_to_win_prob(cp):
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)

def calculate_move_accuracy(wp_before, wp_after):
    diff = max(0, wp_before - wp_after)
    return max(0, min(100, 103.1668 * math.exp(-0.04354 * diff) - 3.1669))

def safe_mean(lst):
    return round(statistics.mean(lst), 1) if lst else 0.0

def analyze_full_game(pgn_string, stockfish_path, depth=15, time_limit=0.5):
    try:
        game = chess.pgn.read_game(io.StringIO(pgn_string))
        if not game:
            return {"error": "Failed to parse PGN."}

        engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
        engine.configure({"Threads": 1, "Hash": 16})
        board = game.board()
        limit = chess.engine.Limit(time=time_limit, depth=depth)

        game_data = {
            p: {"accs": [], "opening": [], "middle": [], "end": []} for p in ["white", "black"]
        }

        info_before = engine.analyse(board, limit)
        cp_before = info_before["score"].pov(chess.WHITE).score(mate_score=10000)
        wp_before = cp_to_win_prob(cp_before)

        move_count = 0
        
        for move in game.mainline_moves():
            move_count += 1
            player = "white" if board.turn == chess.WHITE else "black"
            
            board.push(move)
            info_after = engine.analyse(board, limit)
            
            cp_after = info_after["score"].pov(chess.WHITE).score(mate_score=10000)
            wp_after = cp_to_win_prob(cp_after)

            if player == "white":
                acc = calculate_move_accuracy(wp_before, wp_after)
            else:
                acc = calculate_move_accuracy(100 - wp_before, 100 - wp_after)

            game_data[player]["accs"].append(acc)
            
            full_move = (move_count + 1) // 2
            if full_move <= 15: game_data[player]["opening"].append(acc)
            elif full_move <= 40: game_data[player]["middle"].append(acc)
            else: game_data[player]["end"].append(acc)

            wp_before = wp_after
            cp_before = cp_after

        engine.quit()

        return {
            "white": {
                "overall": safe_mean(game_data["white"]["accs"]),
                "opening": safe_mean(game_data["white"]["opening"]),
                "middle": safe_mean(game_data["white"]["middle"]),
                "end": safe_mean(game_data["white"]["end"])
            },
            "black": {
                "overall": safe_mean(game_data["black"]["accs"]),
                "opening": safe_mean(game_data["black"]["opening"]),
                "middle": safe_mean(game_data["black"]["middle"]),
                "end": safe_mean(game_data["black"]["end"])
            }
        }
    except Exception as e:
        return {"error": f"Engine failed: {str(e)}"}
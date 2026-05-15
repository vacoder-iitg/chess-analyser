import chess.engine
import math
import statistics


def cp_to_win_prob(cp):
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)

def calculate_move_accuracy(wp_before, wp_after):
    diff = max(0, wp_before - wp_after)
    return max(0, min(100, 103.1668 * math.exp(-0.04354 * diff) - 3.1669))

def analyze_game(game, stockfish_path):
    engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
    engine.configure({"Threads": 8, "Hash": 256})
    board = game.board()
    result = game.headers.get("Result", "*")
    limit = chess.engine.Limit(time=0.3)

    game_data = {p: {"accs": [], "opening": [], "middle": [], "end": [], "adv": False, "lose": False} for p in ["white", "black"]}
    
    move_count = 0
    for move in game.mainline_moves():
        move_count += 1
        player = "white" if board.turn == chess.WHITE else "black"
        
        info_before = engine.analyse(board, limit)
        cp_before = info_before["score"].pov(board.turn).score(mate_score=10000)
        wp_before = cp_to_win_prob(cp_before)

        if cp_before > 200: game_data[player]["adv"] = True
        if cp_before < -200: game_data[player]["lose"] = True

        board.push(move)
        info_after = engine.analyse(board, limit)
        wp_after = cp_to_win_prob(info_after["score"].pov(not board.turn).score(mate_score=10000))

        acc = calculate_move_accuracy(wp_before, wp_after)
        game_data[player]["accs"].append(acc)
        
        # Phase logic
        full_move = (move_count + 1) // 2
        if full_move <= 15: game_data[player]["opening"].append(acc)
        elif full_move <= 40: game_data[player]["middle"].append(acc)
        else: game_data[player]["end"].append(acc)

    engine.quit()
    return game_data, result
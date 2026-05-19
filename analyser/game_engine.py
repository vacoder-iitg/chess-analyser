import chess.engine
import math
import statistics
import time
from structural_metrics import calculate_fragility_score

def cp_to_win_prob(cp):
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * cp)) - 1)

def calculate_move_accuracy(wp_before, wp_after):
    diff = max(0, wp_before - wp_after)
    return max(0, min(100, 103.1668 * math.exp(-0.04354 * diff) - 3.1669))

def analyze_game(game, stockfish_path):
    engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
    engine.configure({"Threads": 8, "Hash": 512})
    board = game.board()
    result = game.headers.get("Result", "*")
    
    limit = chess.engine.Limit(time=0.0000003)

    game_data = {
        p: {
            "accs": [], 
            "opening": [], 
            "middle": [], 
            "end": [], 
            "adv": False, 
            "lose": False,
            "fragility_history": [],
            "move_durations": [],     
            "human_think_times": []   
        } for p in ["white", "black"]
    }
    
    # Get the very first evaluation of the starting board state
    info_before = engine.analyse(board, limit)
    cp_before = info_before["score"].pov(chess.WHITE).score(mate_score=10000)
    wp_before = cp_to_win_prob(cp_before)

    # Detect base time control settings
    time_control = game.headers.get("TimeControl", "180")
    try:
        base_clock = float(time_control.split("+")[0])
    except:
        base_clock = 180.0

    last_clocks = {"white": base_clock, "black": base_clock}
    is_first_move = {"white": True, "black": True}

    move_count = 0
    
    # FIXED: Start directly at the root game object.
    # We will traverse downward through the nodes explicitly.
    current_node = game 
    
    for move in game.mainline_moves():
        move_count += 1
        player = "white" if board.turn == chess.WHITE else "black"
        
        # Advance the node iterator to the child node representing this move
        current_node = current_node.next()
        if current_node is None:
            break
            
        if cp_before > 200: game_data[player]["adv"] = True
        if cp_before < -200: game_data[player]["lose"] = True
        
        # EXTRACT ACTUAL HUMAN THINK TIME FROM PGN NODE
        # Using current_node.clock() inside python-chess is fully supported
        current_clock = current_node.clock()
        
        if current_clock is not None:
            think_time = max(0.0, last_clocks[player] - current_clock)
            
            if "+" in time_control and not is_first_move[player]:
                try:
                    increment = float(time_control.split("+")[1])
                    last_clocks[player] += increment 
                    think_time = max(0.0, last_clocks[player] - current_clock)
                except:
                    pass
                
            if is_first_move[player]:
                is_first_move[player] = False
                
            last_clocks[player] = current_clock
        else:
            think_time = 0.0 
            
        game_data[player]["human_think_times"].append(think_time)

        # ENGINE BENCHMARK CLOCK START
        pos_start_time = time.time()
        f_score = calculate_fragility_score(board)
        game_data[player]["fragility_history"].append(f_score)
        
        board.push(move)
        
        info_after = engine.analyse(board, limit)
        pos_duration = time.time() - pos_start_time
        game_data[player]["move_durations"].append(pos_duration)
        
        # Accuracy evaluations
        cp_after = info_after["score"].pov(chess.WHITE).score(mate_score=10000)
        wp_after = cp_to_win_prob(cp_after)

        if player == "white":
            acc = calculate_move_accuracy(wp_before, wp_after)
        else:
            acc = calculate_move_accuracy(100 - wp_before, 100 - wp_after)

        game_data[player]["accs"].append(acc)
        
        # Segmentation Phase logic
        full_move = (move_count + 1) // 2
        if full_move <= 15: game_data[player]["opening"].append(acc)
        elif full_move <= 40: game_data[player]["middle"].append(acc)
        else: game_data[player]["end"].append(acc)

        wp_before = wp_after
        cp_before = cp_after

    engine.quit()
    return game_data, result
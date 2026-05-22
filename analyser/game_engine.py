import chess.engine
import math
import statistics
import time
from structural_metrics import calculate_fragility_score

def cp_to_win_prob(cp):
    """Exact Lichess Centipawn to Win Percentage conversion."""
    clamped_cp = max(-10000, min(10000, cp)) 
    return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * clamped_cp)) - 1)

def calculate_move_accuracy(wp_before, wp_after):
    """Exact Lichess ply accuracy formula with the +1 uncertainty bonus."""
    if wp_after >= wp_before:
        return 100.0

    win_diff = wp_before - wp_after
    raw = 103.1668100711649 * math.exp(-0.04354415386753951 * win_diff) - 3.166924740191411
    
    return max(0.0, min(100.0, raw + 1.0))

def calculate_lichess_game_accuracy(cp_timeline):
    if len(cp_timeline) < 2:
        return 0.0, 0.0

    win_percents = [cp_to_win_prob(cp) for cp in cp_timeline]
    
    num_cps = len(cp_timeline)
    window_size = max(2, min(8, num_cps // 10))
    
    windows = []
    pad_count = max(0, min(window_size, num_cps) - 2)
    first_window = win_percents[:window_size]
    
    for _ in range(pad_count):
        windows.append(first_window)
        
    for i in range(num_cps - window_size + 1):
        windows.append(win_percents[i:i+window_size])
        
    weights = []
    for w in windows:
        std_dev = statistics.stdev(w) if len(w) > 1 else 0.0
        weights.append(max(0.5, min(12.0, std_dev)))
        
    white_accs, white_weights = [], []
    black_accs, black_weights = [], []
    
    for i in range(len(win_percents) - 1):
        wp_before = win_percents[i]
        wp_after = win_percents[i+1]
        
        is_white_turn = (i % 2 == 0)
        
        if is_white_turn:
            acc = calculate_move_accuracy(wp_before, wp_after)
            white_accs.append(acc)
            white_weights.append(weights[i])
        else:
            acc = calculate_move_accuracy(100.0 - wp_before, 100.0 - wp_after)
            black_accs.append(acc)
            black_weights.append(weights[i])
            
    def aggregate(accuracies, wts):
        if not accuracies: return 0.0
        weighted_mean = sum(a * w for a, w in zip(accuracies, wts)) / sum(wts) if sum(wts) > 0 else 0.0
        harmonic_mean = len(accuracies) / sum(1.0 / max(0.1, a) for a in accuracies)
        return (weighted_mean + harmonic_mean) / 2.0
        
    return aggregate(white_accs, white_weights), aggregate(black_accs, black_weights)


def analyze_game(game, stockfish_path):
    engine = chess.engine.SimpleEngine.popen_uci(stockfish_path)
    engine.configure({"Threads": 1, "Hash": 16})
    board = game.board()
    result = game.headers.get("Result", "*")
    
    # Restoring time limits to prevent Render 502 Bad Gateway timeouts
    num_moves = max(1, len(list(game.mainline_moves())))
    dynamic_time = min(0.5, 80.0 / num_moves)
    limit = chess.engine.Limit(time=dynamic_time, depth=15)

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
    game_data["absolute_white_wp_timeline"] = []
    game_data["cp_timeline"] = []
    
    # Get the initial evaluation of the starting position
    info_before = engine.analyse(board, limit)
    cp_before = info_before["score"].pov(chess.WHITE).score(mate_score=10000)
    wp_before = cp_to_win_prob(cp_before)

    # Detect base time control limits
    time_control = game.headers.get("TimeControl", "180")
    try:
        base_clock = float(time_control.split("+")[0])
    except:
        base_clock = 180.0

    last_clocks = {"white": base_clock, "black": base_clock}
    is_first_move = {"white": True, "black": True}

    move_count = 0
    current_node = game 
    
    for move in game.mainline_moves():
        move_count += 1
        player = "white" if board.turn == chess.WHITE else "black"
        
        # Advance the node iterator safely to capture ChildNode block items
        current_node = current_node.next()
        if current_node is None:
            break
            
        if cp_before > 200: game_data[player]["adv"] = True
        if cp_before < -200: game_data[player]["lose"] = True
        
        # EXTRACT ACTUAL HUMAN THINK TIME
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

        # ENGINE WORKFLOW TIMING CLOCK START
        pos_start_time = time.time()
        # Calculate combined fragility of both White and Black pieces for overall board tension
        f_score = calculate_fragility_score(board, chess.WHITE) + calculate_fragility_score(board, chess.BLACK)
        game_data[player]["fragility_history"].append(f_score)
        
        board.push(move)
        
        info_after = engine.analyse(board, limit)
        pos_duration = time.time() - pos_start_time
        game_data[player]["move_durations"].append(pos_duration)
        
        # Calculate scores relative to White to keep win probabilities absolute
        cp_after = info_after["score"].pov(chess.WHITE).score(mate_score=10000)
        wp_after = cp_to_win_prob(cp_after)
        game_data["absolute_white_wp_timeline"].append(wp_after)
        game_data["cp_timeline"].append(cp_after / 100.0)

        if player == "white":
            acc = calculate_move_accuracy(wp_before, wp_after)
        else:
            acc = calculate_move_accuracy(100 - wp_before, 100 - wp_after)

        game_data[player]["accs"].append(acc)
        
        # Phase segmentation
        full_move = (move_count + 1) // 2
        if full_move <= 15: game_data[player]["opening"].append(acc)
        elif full_move <= 40: game_data[player]["middle"].append(acc)
        else: game_data[player]["end"].append(acc)

        wp_before = wp_after
        cp_before = cp_after

    engine.quit()
    return game_data, result
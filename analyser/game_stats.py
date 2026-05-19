import chess.pgn
import statistics
import time
from game_engine import analyze_game # Ensure this matches your filename
from opening_explorer import FastOpeningDetector, detect_opening_from_pgn

PGN_FILE = "chesscom_latest.pgn"
JSON_PATH = "Openings\\openings.json"
STOCKFISH_PATH = r"stockfish\stockfish.exe"
detector = FastOpeningDetector(JSON_PATH)

def calculate_accuracy(acc_list):
    """Utility to handle the harmonic/arithmetic mean blend for a game."""
    if not acc_list: return 0.0
    harmonic = len(acc_list) / sum(1.0 / max(0.1, a) for a in acc_list)
    return (harmonic + statistics.mean(acc_list)) / 2

def format_time(seconds):
    """Helper to cleanly format seconds into MM:SS or HH:MM:SS."""
    if seconds < 3600:
        return time.strftime("%M:%S", time.gmtime(seconds)) + " mm:ss"
    return time.strftime("%H:%M:%S", time.gmtime(seconds)) + " hh:mm:ss"

def count_total_games(filename):
    """Quickly pre-scans the PGN file to find the total game count for accurate ETA."""
    print("Pre-scanning PGN file to count total games... ", end="", flush=True)
    count = 0
    with open(filename) as pgn:
        while chess.pgn.read_headers(pgn):
            count += 1
    print(f"Found {count} games.")
    return count

def find_peak_tension_details(data):
    """Finds maximum fragility value along with sequential move identifier, engine scan time, and human think time."""
    white_history = data["white"].get("fragility_history", [])
    black_history = data["black"].get("fragility_history", [])
    
    timeline = []
    w_idx, b_idx = 0, 0
    
    # Reconstruct timeline in explicit chronological order
    for i in range(len(white_history) + len(black_history)):
        if i % 2 == 0 and w_idx < len(white_history):
            full_move_num = (i // 2) + 1
            timeline.append({
                "score": white_history[w_idx],
                "label": f"Move {full_move_num} (White)",
                "engine_duration": data["white"]["move_durations"][w_idx] if "move_durations" in data["white"] else 0.0,
                "human_duration": data["white"]["human_think_times"][w_idx] if "human_think_times" in data["white"] else 0.0
            })
            w_idx += 1
        elif b_idx < len(black_history):
            full_move_num = (i // 2) + 1
            timeline.append({
                "score": black_history[b_idx],
                "label": f"Move {full_move_num} (Black)",
                "engine_duration": data["black"]["move_durations"][b_idx] if "move_durations" in data["black"] else 0.0,
                "human_duration": data["black"]["human_think_times"][b_idx] if "human_think_times" in data["black"] else 0.0
            })
            b_idx += 1

    if not timeline:
        return 0.0, 0.0, "N/A", 0.0, 0.0

    all_scores = [item["score"] for item in timeline]
    avg_tension = statistics.mean(all_scores)
    
    peak_item = max(timeline, key=lambda x: x["score"])
    
    return avg_tension, peak_item["score"], peak_item["label"], peak_item["engine_duration"], peak_item["human_duration"]

def run_batch(): 
    total_games = count_total_games(PGN_FILE)
    if total_games == 0:
        print("No games found to analyze.")
        return

    game_count = 0
    start_time = time.time()
    
    with open(PGN_FILE) as pgn:
        while True:
            game = chess.pgn.read_game(pgn)
            if not game: break
            
            game_count += 1
            game_start_time = time.time()
            
            white_name = game.headers.get("White", "Unknown")
            black_name = game.headers.get("Black", "Unknown")
            result = game.headers.get("Result", "*")
      
            opening_result = detect_opening_from_pgn(game, detector)

            print(f"\n" + "="*50)
            print(f"GAME #{game_count} / {total_games}: {white_name} vs {black_name}")
            print(f"Result: {result}")
            print("="*50)

            print(f"Opening played: {opening_result}")

            # Run engine evaluation
            data, game_result = analyze_game(game, STOCKFISH_PATH)

            # Print accuracy metrics per player
            for p in ["white", "black"]:
                overall_acc = calculate_accuracy(data[p]["accs"])

                op_avg = statistics.mean(data[p]["opening"]) if data[p]["opening"] else 0
                mid_avg = statistics.mean(data[p]["middle"]) if data[p]["middle"] else 0
                end_avg = statistics.mean(data[p]["end"]) if data[p]["end"] else 0

                print(f"[{p.upper()}]")
                print(f"  Overall Accuracy: {overall_acc:.1f}%")
                print(f"  > Opening: {op_avg:.1f}% | Middle: {mid_avg:.1f}% | End: {end_avg:.1f}%")

                if data[p]["adv"]:
                    status = "CONVERTED" if (p == "white" and result == "1-0") or (p == "black" and result == "0-1") else "MISSED"
                    print(f"  > Advantage State: {status}")
                
                if data[p]["lose"]:
                    status = "SAVED" if result in ["1/2-1/2"] or (p == "white" and result == "1-0") or (p == "black" and result == "0-1") else "LOST"
                    print(f"  > Recovery State: {status}")
                print("-" * 25)

            # Dynamic Positional Fragility Summary Output
            avg_tension, peak_score, peak_move, peak_engine_t, peak_human_t = find_peak_tension_details(data)
            if peak_score > 0:
                print(f"[POSITIONAL FRAGILITY]")
                print(f"  Overall Game Tension (Avg): {avg_tension:.1f}")
                print(f"  Sharpest Tactical Moment (Peak): {peak_score:.1f}")
                print(f"  > Location: {peak_move}")
                print(f"  > Time Spent by Human Player in Game: {peak_human_t:.1f}s")
                print(f"  > Engine Analysis Scan Duration: {peak_engine_t:.4f}s")
                print("-" * 25)

            # Calculate time statistics for progress metrics
            game_duration = time.time() - game_start_time
            elapsed_total = time.time() - start_time
            avg_time_per_game = elapsed_total / game_count
            
            games_left = total_games - game_count
            estimated_time_left = games_left * avg_time_per_game

            # Print Progress Summary Block
            print(f"Finished Game #{game_count}.")
            print(f"  [TIME INFO] This game: {game_duration:.1f}s | Avg/Game: {avg_time_per_game:.1f}s")
            print(f"  [PROGRESS]  Elapsed: {format_time(elapsed_total)} | Remaining ETA: {format_time(estimated_time_left)}")
            print("="*50)

    total_duration = time.time() - start_time
    print(f"\nBatch processing complete! Verified {game_count} games in {format_time(total_duration)}.")

if __name__ == "__main__":
    run_batch()
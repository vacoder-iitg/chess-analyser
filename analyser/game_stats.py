import chess.pgn
import statistics
from game_engine import analyze_game # Ensure this matches your filename
from opening_explorer import FastOpeningDetector,detect_opening_from_pgn


PGN_FILE = "chesscom_latest.pgn"
# PGN_FILE = "lichess_latest.pgn" # Uncomment this line if you want to analyze Lichess games instead
JSON_PATH="Openings\openings.json"
STOCKFISH_PATH = r"stockfish\stockfish.exe"
detector=FastOpeningDetector(JSON_PATH)

def calculate_accuracy(acc_list):
    """Utility to handle the harmonic/arithmetic mean blend for a game."""
    if not acc_list: return 0.0
    harmonic = len(acc_list) / sum(1.0 / max(0.1, a) for a in acc_list)
    return (harmonic + statistics.mean(acc_list)) / 2

def run_batch():
    game_count = 0
    
    with open(PGN_FILE) as pgn:
        while True:
            game = chess.pgn.read_game(pgn)
            if not game: break
            
            game_count += 1
            white_name = game.headers.get("White", "Unknown")
            black_name = game.headers.get("Black", "Unknown")
            result = game.headers.get("Result", "*")
      
            opening_result=detect_opening_from_pgn(game,detector)

            print(f"\n" + "="*50)
            print(f"GAME #{game_count}: {white_name} vs {black_name}")
            print(f"Result: {result}")
            print("="*50)

            print(f"Opening played:{opening_result}")

            # 1. Analyze the individual game
            data, game_result = analyze_game(game, STOCKFISH_PATH)

            # 2. Process and Print Stats for EACH Player in THIS game
            for p in ["white", "black"]:
                # Calculate independent game accuracy
                overall_acc = calculate_accuracy(data[p]["accs"])
                
                # Phase breakdown
                op_avg = statistics.mean(data[p]["opening"]) if data[p]["opening"] else 0
                mid_avg = statistics.mean(data[p]["middle"]) if data[p]["middle"] else 0
                end_avg = statistics.mean(data[p]["end"]) if data[p]["end"] else 0

                # Highlight stats
                print(f"[{p.upper()}]")
                print(f"  Overall Accuracy: {overall_acc:.1f}%")
                print(f"  > Opening: {op_avg:.1f}% | Middle: {mid_avg:.1f}% | End: {end_avg:.1f}%")
                
                # Technical performance
                if data[p]["adv"]:
                    status = "CONVERTED" if (p == "white" and result == "1-0") or (p == "black" and result == "0-1") else "MISSED"
                    print(f"  > Advantage State: {status}")
                
                if data[p]["lose"]:
                    status = "SAVED" if result in ["1/2-1/2"] or (p == "white" and result == "1-0") or (p == "black" and result == "0-1") else "LOST"
                    print(f"  > Recovery State: {status}")
                print("-" * 25)

            print(f"Finished Game #{game_count}. Moving to next...")

if __name__ == "__main__":
    run_batch()
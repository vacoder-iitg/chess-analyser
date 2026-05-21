import chess.pgn
import json

class FastOpeningDetector:
    def __init__(self, json_path):
        try:
            with open(json_path, 'r') as f:
                self.raw_data = json.load(f)
            # Indexing by the first 4 parts of FEN (position + turn + castling + en passant)
            self.opening_db = {
                " ".join(k.split(" ")[:4]): v 
                for k, v in self.raw_data.items()
            }
        except FileNotFoundError:
            print(f"Error: {json_path} not found.")
            self.opening_db = {}

    def get_name(self, board):
        # Clean the FEN to match the DB format
        current_fen_clean = " ".join(board.fen().split(" ")[:4])
        return self.opening_db.get(current_fen_clean, None)

def detect_opening_from_pgn(game, detector):
    if not game:
        return "No Game Data"

    board = game.board()
    # Starting with the header info as a fallback
    final_opening = game.headers.get("Opening", "Unknown Opening")

    # Trace through the moves
    for i, move in enumerate(game.mainline_moves()):
        board.push(move)
        #  checking the first 40 ply (20 full moves) for efficiency
        if i < 40:
            match = detector.get_name(board)
            if match:
                final_opening = match
        else:
            break # Stop checking after move 20
    
    return final_opening
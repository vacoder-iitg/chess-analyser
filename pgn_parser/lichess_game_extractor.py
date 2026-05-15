import lichess.api
from lichess.format import SINGLE_PGN

# --- CONFIGURATION ---
LICHESS_USERNAME = "vishwasadi" # Use your actual username
SAVE_PATH = "lichess_latest.pgn"

def download_last_games(username, count=5):
    print(f"Connecting to Lichess to fetch last {count} games...")
    
    try:
        # Use SINGLE_PGN to get the raw text string of the games
        pgn_data = lichess.api.user_games(username, max=count, format=SINGLE_PGN)
        
        with open(SAVE_PATH, "w", encoding="utf-8") as f:
            f.write(pgn_data)
            
        print(f"Success! Saved to {SAVE_PATH}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    download_last_games(LICHESS_USERNAME, 5)
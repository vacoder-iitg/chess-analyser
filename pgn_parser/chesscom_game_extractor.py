PLAYER = "v-a-c"
NOG = 10 
import requests

def get_json(url):
    # Added your email to headers as Chess.com requires it for stability
    response = requests.get(url, headers={"User-Agent": "adityavishwas83@gmail.com"})
    if response.status_code == 200:
        return response.json()
    print(f"Could not download [{url}], code {response.status_code}")
    return None

print("Downloading archives...")

url = f"https://api.chess.com/pub/player/{PLAYER}/games/archives"
json_data = get_json(url)

if json_data:
    print("Archives downloaded successfully")
    
    # 1. REVERSE the archives list to start with the newest month
    urls = json_data["archives"][::-1] 
    pgns = []

    print(f"Searching for the latest {NOG} games...")

    for archive_url in urls:
        month_data = get_json(archive_url)

        if month_data:
            # 2. REVERSE the games in this month (newest day first)
            month_games = month_data["games"][::-1] 
            
            for game in month_games:
                if "pgn" in game:
                    pgns.append(game["pgn"])
                    
                # Stop as soon as we hit the target NOG
                if len(pgns) == NOG:
                    break
        
        # If we already have enough games, stop checking older months
        if len(pgns) == NOG:
            break

    # 3. Save to file
    filename = f"chesscom_latest.pgn"
    with open(filename, "w", encoding="utf-8") as f:
        f.write("\n\n".join(pgns))

    print(f"Success! {len(pgns)} latest games downloaded to [{filename}]")
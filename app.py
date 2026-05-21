from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import chess
import chess.engine
import os
import sys
import requests
import ndjson
import asyncio
from typing import Optional

import platform

def get_engine_path():
    if platform.system() == "Windows":
        return os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish.exe')
    else:
        local_linux = os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish')
        if os.path.exists(local_linux):
            return local_linux
        return "stockfish"

sys.path.append(os.path.join(os.path.dirname(__file__), 'analyser'))
from opening_explorer import FastOpeningDetector
from game_engine import cp_to_win_prob, calculate_move_accuracy, analyze_game
from game_analyzer import analyze_full_game

import io

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

openings_path = os.path.join(os.path.dirname(__file__), 'Openings', 'openings.json')
detector = FastOpeningDetector(openings_path)

engine = None
current_analysis_task = None
evaluation_cache = {}

@app.on_event("startup")
async def startup_event():
    global engine
    engine_path = get_engine_path()
    try:
        transport, engine = await chess.engine.popen_uci(engine_path)
        await engine.configure({"Threads": 2, "Hash": 128})
    except Exception:
        engine = None

class EvaluationRequest(BaseModel):
    fen: str
    prev_fen: Optional[str] = None
    depth: Optional[int] = 15
    time: Optional[float] = 0.5

class FullGameAnalysisRequest(BaseModel):
    pgn: str
    depth: Optional[int] = 15
    time_limit: Optional[float] = 0.5

@app.get("/", response_class=HTMLResponse)
async def get_index():
    with open(os.path.join(os.path.dirname(__file__), 'static', 'index.html'), 'r') as f:
        return f.read()

def get_threats(board: chess.Board):
    threats = []
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece:
            attacks = board.attacks(square)
            for target_square in attacks:
                target_piece = board.piece_at(target_square)
                if target_piece and piece.color != target_piece.color:
                    threats.append({"from": chess.square_name(square), "to": chess.square_name(target_square), "color": "white" if piece.color == chess.WHITE else "black"})
    return threats

def format_evaluation_response(raw_eval: dict, req: EvaluationRequest, board: chess.Board, opening_name: str):
    cp_after = raw_eval["raw_cp"]
    response_data = {"score": raw_eval["score"], "mate": raw_eval["mate"], "best_move": raw_eval["best_move"], "opening": opening_name, "category": None, "accuracy": None, "raw_cp": cp_after, "threats": get_threats(board)}
    player = "white" if not board.turn else "black"
    if opening_name != "Unknown Opening":
        response_data["category"] = "Book Move"
        response_data["accuracy"] = 100.0
    elif req.prev_cp is not None or req.prev_mate is not None:
        prev_cp = req.prev_cp if req.prev_cp is not None else (10000 if req.prev_mate > 0 else -10000)
        wp_before, wp_after = cp_to_win_prob(prev_cp), cp_to_win_prob(cp_after)
        acc = calculate_move_accuracy(wp_before, wp_after) if player == "white" else calculate_move_accuracy(100 - wp_before, 100 - wp_after)
        response_data["accuracy"] = acc
        if acc >= 98: cat = "Best Move"
        elif acc >= 90: cat = "Excellent"
        elif acc >= 80: cat = "Good"
        elif acc >= 70: cat = "Inaccuracy"
        elif acc >= 50: cat = "Mistake"
        else: cat = "Blunder"
        response_data["category"] = cat
@app.post("/evaluate")
async def evaluate_position(req: EvaluationRequest):
    global current_analysis_task
    fen = req.fen
    prev_fen = req.prev_fen
    board = chess.Board(fen)
    opening_name = detector.get_name(board) or "Unknown Opening"
    
    if not engine: 
        return {"evaluation": "0.00", "mate": None, "best_move": "-", "category": None, "accuracy": None, "opening": opening_name}
    
    if current_analysis_task and not current_analysis_task.done():
        current_analysis_task.cancel()
        try:
            await current_analysis_task
        except Exception:
            pass

    async def run_analysis():
        cache_key = f"{fen}_{req.depth}_{req.time}"
        if cache_key in evaluation_cache:
            info_current = evaluation_cache[cache_key]
        else:
            info = await engine.analyse(board, chess.engine.Limit(time=req.time, depth=req.depth))
            cp_after = score = 0.0
            mate = best_move = None
            if "score" in info:
                score_val = info["score"].white()
                cp_after = info["score"].pov(chess.WHITE).score(mate_score=10000)
                if score_val.is_mate(): mate = score_val.mate()
                else: score = score_val.score() / 100.0
            if "pv" in info and len(info["pv"]) > 0: best_move = board.san(info["pv"][0])
            info_current = {"score": score, "mate": mate, "best_move": best_move, "raw_cp": cp_after}
            evaluation_cache[cache_key] = info_current

        score = info_current["score"]
        mate = info_current["mate"]
        best_move = info_current["best_move"]
        cp_after = info_current["raw_cp"]
        
        category = None
        accuracy = None
        prev_best_move = None
        
        if prev_fen:
            if opening_name != "Unknown Opening":
                category = "Book Move"
                accuracy = 100.0
            else:
                prev_cache_key = f"{prev_fen}_{req.depth}_{req.time}"
                if prev_cache_key in evaluation_cache:
                    prev_cp = evaluation_cache[prev_cache_key]["raw_cp"]
                else:
                    prev_board = chess.Board(prev_fen)
                    info_prev = await engine.analyse(prev_board, chess.engine.Limit(time=req.time, depth=req.depth))
                    prev_cp = info_prev["score"].pov(chess.WHITE).score(mate_score=10000)
                    evaluation_cache[prev_cache_key] = {
                        "score": info_prev["score"].white().score(mate_score=10000)/100.0,
                        "mate": info_prev["score"].white().mate(),
                        "best_move": prev_board.san(info_prev["pv"][0]) if "pv" in info_prev and info_prev["pv"] else None,
                        "raw_cp": prev_cp
                    }
                
                prev_best_move = evaluation_cache[prev_cache_key]["best_move"]
                
                player = "black" if board.turn == chess.WHITE else "white"
                wp_before = cp_to_win_prob(prev_cp)
                wp_after = cp_to_win_prob(cp_after)
                
                acc = calculate_move_accuracy(wp_before, wp_after) if player == "white" else calculate_move_accuracy(100 - wp_before, 100 - wp_after)
                accuracy = acc
                if acc >= 98: category = "Best Move"
                elif acc >= 90: category = "Excellent"
                elif acc >= 80: category = "Good"
                elif acc >= 70: category = "Inaccuracy"
                elif acc >= 50: category = "Mistake"
                else: category = "Blunder"

        return {
            "score": score,
            "raw_cp": cp_after,
            "evaluation": f"M{mate}" if mate is not None else f"{score:+.2f}",
            "mate": mate,
            "best_move": best_move or "-",
            "category": category,
            "accuracy": accuracy,
            "opening": opening_name,
            "threats": get_threats(board),
            "prev_best_move": prev_best_move
        }

    current_analysis_task = asyncio.create_task(run_analysis())
    try:
        return await current_analysis_task
    except asyncio.CancelledError:
        return {"score": 0.0, "mate": None, "best_move": None, "opening": opening_name, "category": "Interrupted", "accuracy": None, "raw_cp": 0, "threats": [], "prev_best_move": None}

@app.post("/analyze_full_game")
async def handle_full_game_analysis(req: FullGameAnalysisRequest):
    engine_path = get_engine_path()
    try:
        results = await asyncio.to_thread(analyze_full_game, req.pgn, engine_path, req.depth, req.time_limit)
        if not results:
            return {"error": "Invalid PGN"}
        return results
    except Exception as e:
        return {"error": str(e)}

@app.post("/plot_game")
async def handle_plot_game(req: FullGameAnalysisRequest):
    engine_path = get_engine_path()
    try:
        def generate_plot():
            game = chess.pgn.read_game(io.StringIO(req.pgn))
            if not game:
                return {"error": "Failed to parse PGN."}
            data, result = analyze_game(game, engine_path)
            
            # Remove plotter.py usage and return raw JSON data for Chart.js
            return {"metrics": data}
            
        results = await asyncio.to_thread(generate_plot)
        return results
    except Exception as e:
        import traceback
        return {"error": repr(e) + " " + traceback.format_exc()}

@app.get("/fetch_games")
async def fetch_games(platform: str, username: str, time_format: str):
    games = []
    headers = {"User-Agent": "adityavishwas83@gmail.com"}
    if platform == "lichess":
        r = requests.get(f"https://lichess.org/api/games/user/{username}?max=10&perfType={time_format}&pgnInJson=true", headers={"Accept": "application/x-ndjson"})
        if r.status_code == 200:
            for game in ndjson.loads(r.text):
                wp, bp = game.get("players", {}).get("white", {}), game.get("players", {}).get("black", {})
                res = "1-0" if game.get("winner") == "white" else "0-1" if game.get("winner") == "black" else "1/2-1/2"
                if game.get("pgn"): games.append({"white": wp.get("user", {}).get("name", "Unknown"), "white_rating": wp.get("rating", "?"), "black": bp.get("user", {}).get("name", "Unknown"), "black_rating": bp.get("rating", "?"), "result": res, "pgn": game["pgn"]})
    elif platform == "chesscom":
        r = requests.get(f"https://api.chess.com/pub/player/{username}/games/archives", headers=headers)
        if r.status_code == 200:
            for arch in r.json().get("archives", [])[::-1]:
                if len(games) >= 10: break
                ar = requests.get(arch, headers=headers)
                if ar.status_code == 200:
                    for g in ar.json().get("games", [])[::-1]:
                        if len(games) >= 10: break
                        if g.get("time_class") == time_format and "pgn" in g:
                            res = "1-0" if g.get("white", {}).get("result") == "win" else "0-1" if g.get("black", {}).get("result") == "win" else "1/2-1/2"
                            games.append({"white": g.get("white", {}).get("username", "Unknown"), "white_rating": g.get("white", {}).get("rating", "?"), "black": g.get("black", {}).get("username", "Unknown"), "black_rating": g.get("black", {}).get("rating", "?"), "result": res, "pgn": g["pgn"]})
    return {"games": games}

@app.on_event("shutdown")
async def shutdown_event():
    if engine: await engine.quit()
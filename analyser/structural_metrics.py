import chess
import networkx as nx

def calculate_fragility_score(board: chess.Board) -> float:
    """
    Calculates the positional Fragility Score based on the 
    Betweenness Centrality of pieces under active attack.
    """
    G = nx.DiGraph()
    
    # 1. Initialize all active pieces as nodes
    all_squares = chess.SQUARES
    pieces_on_board = {}
    
    for square in all_squares:
        piece = board.piece_at(square)
        if piece:
            pieces_on_board[square] = piece
            G.add_node(square, piece_type=piece.piece_type, color=piece.color)
            
    # 2. Build the Directed Interactivity Edges
    under_attack = set()
    
    for square, piece in pieces_on_board.items():
        # Look at all squares this piece can legally attack/protect
        attacks = board.attacks(square)
        for target_square in attacks:
            if target_square in pieces_on_board:
                target_piece = pieces_on_board[target_square]
                
                # Case A: Defensive link (Same color)
                if piece.color == target_piece.color:
                    G.add_edge(square, target_square, type='defense')
                    
                # Case B: Offensive link (Opposing color)
                else:
                    G.add_edge(square, target_square, type='attack')
                    # Mark the target piece as actively threatened
                    under_attack.add(target_square)

    # If nothing is under threat, structural fragility is zero
    if not under_attack or len(G.nodes) <= 2:
        return 0.0

    # 3. Compute Network-wide Betweenness Centrality
    # (Normalized by total possible node pairs to prevent endgames from blowing up metrics)
    centrality = nx.betweenness_centrality(G, normalized=True)
    
    # 4. Fragility is the sum of centrality weights for pieces actively under attack
    fragility_score = sum(centrality[square] for square in under_attack)
    
    # Scale it to a friendly integer scale (0 to 100)
    return round(fragility_score * 100, 2)
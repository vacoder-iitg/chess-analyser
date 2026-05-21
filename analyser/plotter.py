import matplotlib.pyplot as plt

def plot_game_metrics(data, game_id="1"):
    """
    Saves a stacked dual-panel visualization sharing a single chronological timeline:
    Panel 1 (Top): Structural Fragility vs. Human Think Time
    Panel 2 (Bottom): Engine Evaluation (White Win Probability %)
    """
    white_f = data["white"].get("fragility_history", [])
    black_f = data["black"].get("fragility_history", [])
    white_t = data["white"].get("human_think_times", [])
    black_t = data["black"].get("human_think_times", [])
    wp_timeline = data.get("absolute_white_wp_timeline", [])

    # Chronologically weave timelines together
    timeline_fragility = []
    timeline_think_time = []
    x_labels = []

    w_idx, b_idx = 0, 0
    total_turns = len(white_f) + len(black_f)

    for i in range(total_turns):
        if i % 2 == 0 and w_idx < len(white_f):
            timeline_fragility.append(white_f[w_idx])
            timeline_think_time.append(white_t[w_idx])
            x_labels.append(f"{w_idx + 1}W")
            w_idx += 1
        elif b_idx < len(black_f):
            timeline_fragility.append(black_f[b_idx])
            timeline_think_time.append(black_t[b_idx])
            x_labels.append(f"{b_idx + 1}B")
            b_idx += 1

    if not timeline_fragility:
        print("No move history data available to chart.")
        return

    fig, (ax1, ax3) = plt.subplots(nrows=2, ncols=1, figsize=(15, 10), sharex=True)
    x_positions = list(range(1, len(timeline_fragility) + 1))

    # ==========================================
    # PANEL 1 (TOP): FRAGILITY VS THINK TIME
    # ==========================================
    color_f = '#d62728'  
    ax1.set_ylabel('Structural Fragility Score (0-100)', color=color_f, fontsize=11, fontweight='bold')
    line1 = ax1.plot(x_positions, timeline_fragility, color=color_f, linewidth=2, marker='o', markersize=3, label='Fragility (Tension)')
    ax1.tick_params(axis='y', labelcolor=color_f)
    ax1.set_ylim(0, max(max(timeline_fragility, default=10), 100))
    ax1.grid(True, linestyle=':', alpha=0.6)

    ax2 = ax1.twinx()
    color_t = '#1f77b4'  
    ax2.set_ylabel('Human Think Time (seconds)', color=color_t, fontsize=11, fontweight='bold')
    line2 = ax2.plot(x_positions, timeline_think_time, color=color_t, linewidth=1.5, linestyle='--', marker='s', markersize=3, alpha=0.7, label='Think Time')
    ax2.tick_params(axis='y', labelcolor=color_t)
    ax2.set_ylim(0, max(timeline_think_time, default=10) * 1.15)

    lines = line1 + line2
    labels = [l.get_label() for l in lines]
    ax1.legend(lines, labels, loc='upper left', frameon=True, facecolor='white', framealpha=0.9)
    ax1.set_title(f'Game #{game_id} Structural Volatility Analysis', fontsize=12, fontweight='bold')

    # ==========================================
    # PANEL 2 (BOTTOM): ENGINE EVALUATION PROFILE
    # ==========================================
    clipped_wp = wp_timeline[:len(x_positions)]
    ax3.plot(x_positions, clipped_wp, color='#2ca02c', linewidth=2.5, label='White Win Prob %')
    ax3.axhline(y=50, color='gray', linestyle='-.', alpha=0.5, label='Equal (50%)')
    
    # Safe background bounding box colors (Handling vector shapes across versions)
    try:
        ax3.fill_between(x_positions, clipped_wp, 50, where=[val >= 50 for val in clipped_wp], color='#2ca02c', alpha=0.15)
        ax3.fill_between(x_positions, clipped_wp, 50, where=[val < 50 for val in clipped_wp], color='#d62728', alpha=0.1)
    except:
        pass

    ax3.set_ylabel('White Win Probability (%)', fontsize=11, fontweight='bold')
    ax3.set_xlabel('Move Timeline (W = White, B = Black)', fontsize=12, labelpad=10)
    ax3.set_ylim(0, 100)
    ax3.grid(True, linestyle=':', alpha=0.6)
    ax3.legend(loc='lower left')

    if len(x_positions) <= 40:
        ax3.set_xticks(x_positions)
        ax3.set_xticklabels(x_labels, rotation=45, fontsize=9)
    else:
        step = 2 if len(x_positions) <= 80 else 4
        ax3.set_xticks(x_positions[::step])
        ax3.set_xticklabels([x_labels[idx] for idx in range(0, len(x_labels), step)], rotation=45, fontsize=9)

    plt.suptitle(f'Chess Engine Advanced Dashboard: Tactical Tension vs. Positional Evaluation', 
                 fontsize=14, fontweight='bold', y=0.96)
    
    plt.tight_layout(rect=[0, 0, 1, 0.94])
    output_filename = f"game_{game_id}_stacked_dashboard.png"
    plt.savefig(output_filename, dpi=300)
    plt.close()
    print(f" saved successfully as: '{output_filename}'")
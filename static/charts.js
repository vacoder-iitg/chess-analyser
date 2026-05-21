import { state, elements } from './state.js';
import { jumpToMove } from './gameLogic.js';

let evalChartInstance = null;
let metricsChartInstance = null;

export async function plotGameMetrics(pgnText, btnElement) {
    if (!pgnText) return alert("Please paste a PGN, fetch a game, or play some moves first!");
    
    // Ensure loadedGameMoves is up to date with the plotted PGN
    let tempGame = new Chess();
    if (tempGame.load_pgn(pgnText)) {
        state.loadedGameMoves = tempGame.history();
    }
    
    const originalText = btnElement.textContent;
    btnElement.textContent = 'Analysing game...';
    btnElement.disabled = true;
    elements.plotLoading.classList.remove('hidden');
    elements.evalChart.style.display = 'none';
    elements.metricsChart.style.display = 'none';

    try {
        const response = await fetch('/plot_game', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pgn: pgnText })
        });
        
        const data = await response.json();
        if (data.detail) throw new Error("Validation Error: " + JSON.stringify(data.detail));
        if (data.error) throw new Error(data.error);
        if (!data.metrics) throw new Error("Invalid response format.");

        const metrics = data.metrics;
        const timeline_fragility = [];
        const timeline_think_time = [];
        const wp_timeline = metrics.absolute_white_wp_timeline || [];
        const labels = [];
        
        const white_f = metrics.white.fragility_history || [];
        const black_f = metrics.black.fragility_history || [];
        const white_t = metrics.white.human_think_times || [];
        const black_t = metrics.black.human_think_times || [];
        
        let w_idx = 0, b_idx = 0;
        const total_turns = white_f.length + black_f.length;
        
        for (let i = 0; i < total_turns; i++) {
            if (i % 2 === 0 && w_idx < white_f.length) {
                timeline_fragility.push(white_f[w_idx]);
                timeline_think_time.push(white_t[w_idx]);
                labels.push(`${w_idx + 1}W`);
                w_idx++;
            } else if (b_idx < black_f.length) {
                timeline_fragility.push(black_f[b_idx]);
                timeline_think_time.push(black_t[b_idx]);
                labels.push(`${b_idx + 1}B`);
                b_idx++;
            }
        }
        
        const clipped_wp = wp_timeline.slice(0, labels.length);
        
        const annotations = {
            zeroLine: {
                type: 'line',
                yMin: 50,
                yMax: 50,
                borderColor: 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderDash: [5, 5]
            }
        };

        if (labels.length > 0) {
            annotations.openingLine = {
                type: 'line',
                xMin: 0,
                xMax: 0,
                borderWidth: 0,
                label: { display: true, content: 'Opening', position: 'end', rotation: 90, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', font: {size: 14}, yAdjust: 40, xAdjust: 25 }
            };
        }
        
        if (labels.length > 30) {
            annotations.middlegameLine = {
                type: 'line',
                xMin: 30,
                xMax: 30,
                borderColor: 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderDash: [4, 4],
                label: { display: true, content: 'Middlegame', position: 'end', rotation: 90, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', font: {size: 14}, yAdjust: 40, xAdjust: 20 }
            };
        }
        
        if (labels.length > 80) {
            annotations.endgameLine = {
                type: 'line',
                xMin: 80,
                xMax: 80,
                borderColor: 'rgba(255, 255, 255, 0.4)',
                borderWidth: 1,
                borderDash: [4, 4],
                label: { display: true, content: 'Endgame', position: 'end', rotation: 90, backgroundColor: 'transparent', color: 'rgba(255,255,255,0.6)', font: {size: 14}, yAdjust: 40, xAdjust: 20 }
            };
        }

        if (evalChartInstance) evalChartInstance.destroy();
        if (metricsChartInstance) metricsChartInstance.destroy();

        const ctxEval = elements.evalChart.getContext('2d');
        const ctxMetrics = elements.metricsChart.getContext('2d');
        
        elements.evalChart.style.display = 'block';
        elements.metricsChart.style.display = 'block';
        const tacticalInfo = document.getElementById('tactical-tension-info');
        if (tacticalInfo) tacticalInfo.style.display = 'block';

        const commonOptions = {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const idx = activeElements[0].index;
                    jumpToMove(idx);
                    const boardEl = document.getElementById('board');
                    if (boardEl) boardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            },
            plugins: {
                legend: { labels: { color: '#e0e0e0' } },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        title: (context) => {
                            const index = context[0].dataIndex;
                            const move = state.loadedGameMoves[index];
                            return `${context[0].label}: ${move || ''}`;
                        }
                    }
                }
            }
        };

        evalChartInstance = new Chart(ctxEval, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Advantage',
                    data: clipped_wp,
                    borderColor: '#ff6b00',
                    backgroundColor: 'rgba(150, 150, 150, 0.4)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    yAxisID: 'y',
                    tension: 0.1
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: { ticks: { color: '#aaaaaa', maxTicksLimit: 20 }, grid: { color: '#333333' } },
                    y: {
                        type: 'linear', display: true, position: 'left', min: 0, max: 100,
                        title: { display: false }, grid: { color: '#333333' }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    annotation: { annotations: annotations }
                }
            }
        });

        metricsChartInstance = new Chart(ctxMetrics, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Tactical Tension',
                        data: timeline_fragility,
                        borderColor: '#d62728',
                        backgroundColor: '#d62728',
                        yAxisID: 'y1',
                        borderWidth: 1.5,
                        pointRadius: 1,
                        pointHoverRadius: 3
                    },
                    {
                        label: 'Think Time (sec)',
                        data: timeline_think_time,
                        borderColor: '#1f77b4',
                        backgroundColor: '#1f77b4',
                        yAxisID: 'y2',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointStyle: 'rect',
                        pointRadius: 2,
                        pointHoverRadius: 4
                    }
                ]
            },
            options: {
                ...commonOptions,
                scales: {
                    x: { ticks: { color: '#aaaaaa', maxTicksLimit: 20 }, grid: { color: '#333333' } },
                    y1: {
                        type: 'linear', display: true, position: 'left', min: 0,
                        title: { display: true, text: 'Tension', color: '#d62728' }, grid: { color: '#333333' }
                    },
                    y2: {
                        type: 'linear', display: true, position: 'right', min: 0,
                        title: { display: true, text: 'Time (s)', color: '#1f77b4' }, grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    ...commonOptions.plugins,
                    annotation: {
                        annotations: {
                            ...(labels.length > 0 ? { openingLine: { ...annotations.openingLine, label: { display: false } } } : {}),
                            ...(labels.length > 30 ? { middlegameLine: { ...annotations.middlegameLine, label: { display: false } } } : {}),
                            ...(labels.length > 80 ? { endgameLine: { ...annotations.endgameLine, label: { display: false } } } : {})
                        }
                    }
                }
            }
        });
    } catch (e) {
        alert("Plot generation failed: " + e.message);
    } finally {
        btnElement.textContent = originalText;
        btnElement.disabled = false;
        elements.plotLoading.classList.add('hidden');
    }
}

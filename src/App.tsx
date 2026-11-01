import { useState } from 'react';
import { useGame } from './hooks/useGame';
import { xpForNextLevel as xpProgress } from './game/progress';
import Board from './components/Board';
import OrderPanel from './components/OrderPanel';

import EnergyBar from './components/EnergyBar';
import Sparkles from './components/Sparkles';
import PlotSelect from './components/PlotSelect';

export default function App() {
  const g = useGame();
  const [screen, setScreen] = useState<'play' | 'garden' | 'plots'>('play');

  if (screen === 'plots') {
    return (
      <PlotSelect
        unlocked={g.unlockedPlots}
        onSelect={(i) => {
          g.selectPlot(i);
          setScreen('play');
        }}
      />
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', minWidth: 0 }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .pop { animation: pop 0.3s ease; }
      `}</style>
      <h1>Little Winds</h1>
      <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 8 }}>A Cozy Merge Story</div>
      <EnergyBar energy={g.energy} maxEnergy={g.maxEnergy} energyUpdatedAt={g.energyUpdatedAt} />
      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>⭐ Stars: {g.starBalance}</div>
      <div style={{ marginBottom: 8 }}>XP: {g.xp} (Level {g.level})</div>
      <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ width: `${xpProgress(g.xp).pct}%`, height: '100%', background: '#90caf9' }} />
      </div>
      {import.meta.env.DEV && (
        <div style={{ marginBottom: 8, fontSize: 12 }}>
          <label style={{ display: 'block' }}>
            <input type="checkbox" checked={g.unlimited} onChange={(e) => g.setUnlimited(e.target.checked)} />
            Dev: Unlimited Energy
          </label>
          <button onClick={g.resetGame} style={{ marginTop: 4 }}>Dev: Reset Game</button>
          <button onClick={() => setScreen('plots')} style={{ marginTop: 4, marginLeft: 8 }}>Dev: Plots</button>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <Board board={g.board} nudge={g.nudge} hint={g.hint} onDrop={g.handleDrop} onGeneratorTap={g.tapGenerator} />
        <Sparkles pos={g.sparkle} />
      </div>
      <div style={{ marginTop: 12 }}>
        <OrderPanel orders={g.orders} board={g.board} onServe={g.serveOrder} />
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setScreen('garden')}>Garden Restoration</button>
      </div>
      {screen === 'garden' && (
        <div style={{ marginTop: 12, padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
          <h3>Garden Restoration</h3>
          <div style={{ marginBottom: 12 }}>
            <strong>Features</strong>
            {g.gardenFeatures.map((f) => (
              <div key={f.id} style={{ fontSize: 12 }}>
                {g.gardenUnlocks.includes(f.id) ? '✅' : '🔒'} {f.name} — {f.description}
              </div>
            ))}
          </div>
          {g.restorationTasks.map((t) => {
            const done = g.completedRestoration.includes(t.id);
            const available = g.isTaskAvailable(t, g.completedRestoration);
            return (
              <div key={t.id} style={{ marginBottom: 8, opacity: done ? 0.5 : 1 }}>
                <div><strong>{t.name}</strong> — {t.cost} ⭐</div>
                <div style={{ fontSize: 12 }}>{t.description}</div>
                {!done && (
                  <button disabled={!available || g.starBalance < t.cost} onClick={() => g.restoreTask(t.id)}>
                    Restore
                  </button>
                )}
                {done && <span>✅ Done</span>}
              </div>
            );
          })}
          <button onClick={() => setScreen('play')}>Back</button>
        </div>
      )}
    </div>
  );
}
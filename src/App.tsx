import { useEffect, useRef, useState } from 'react';
import { useGame } from './hooks/useGame';
import { xpForNextLevel as xpProgress } from './game/progress';
import Board from './components/Board';
import OrderPanel from './components/OrderPanel';
import EnergyBar from './components/EnergyBar';
import Sparkles from './components/Sparkles';
import PlotSelect from './components/PlotSelect';

function formatCountdown(updatedAt: number): string {
  const remaining = Math.max(0, 60000 - (Date.now() - updatedAt));
  const s = Math.ceil(remaining / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export default function App() {
  const g = useGame();
  const [screen, setScreen] = useState<'play' | 'garden' | 'plots'>('play');
  const [levelUp, setLevelUp] = useState(false);
  const [starReward, setStarReward] = useState<number | null>(null);
  const prevLevel = useRef(g.level);
  const prevStars = useRef(g.starBalance);

  useEffect(() => {
    if (g.level > prevLevel.current) {
      setLevelUp(true);
      const t = setTimeout(() => setLevelUp(false), 2000);
      prevLevel.current = g.level;
      return () => clearTimeout(t);
    }
    prevLevel.current = g.level;
  }, [g.level]);

  useEffect(() => {
    const diff = g.starBalance - prevStars.current;
    if (diff > 0) {
      setStarReward(diff);
      const t = setTimeout(() => setStarReward(null), 1200);
      prevStars.current = g.starBalance;
      return () => clearTimeout(t);
    }
    prevStars.current = g.starBalance;
  }, [g.starBalance]);

  const goal = g.restorationTasks.find((t) => t.id === g.selectedGoalId);
  const goalProgress = goal ? Math.min(g.starBalance / goal.cost, 1) : 0;
  const goalRemaining = goal ? Math.max(goal.cost - g.starBalance, 0) : 0;

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
    <div style={{ padding: 8, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto', width: '100%', boxSizing: 'border-box', minWidth: 0, height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .pop { animation: pop 0.3s ease; }
      `}</style>
      <h1 style={{ margin: 0, fontSize: 20 }}>Little Winds</h1>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>A Cozy Merge Story</div>
      <EnergyBar energy={g.energy} maxEnergy={g.maxEnergy} energyUpdatedAt={g.energyUpdatedAt} />
      <div style={{ fontSize: 12, marginBottom: 2 }}>⭐ Stars: {g.starBalance} · XP: {g.xp} (Level {g.level})</div>
      <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ width: `${xpProgress(g.xp).pct}%`, height: '100%', background: '#90caf9', transition: 'width 0.3s' }} />
      </div>
      <div style={{ fontSize: 11, marginBottom: 4 }}>
        Level {g.level} — {xpProgress(g.xp).current}/{xpProgress(g.xp).needed} XP to Level {g.level + 1}
      </div>
      {goal && (
        <div style={{ fontSize: 11, marginBottom: 4 }}>
          🌿 {goal.name}: {g.starBalance}/{goal.cost} stars ({goalRemaining} more)
          <div style={{ height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${goalProgress * 100}%`, height: '100%', background: '#81c784', transition: 'width 0.3s' }} />
          </div>
          {goalProgress >= 1 && <span style={{ color: '#2e7d32', fontWeight: 'bold' }}>Ready to Restore!</span>}
        </div>
      )}
      {starReward && (
        <div style={{ position: 'fixed', top: 60, right: 16, color: '#f9a825', fontWeight: 'bold', animation: 'pop 0.6s ease', zIndex: 999 }}>
          +{starReward} ⭐
        </div>
      )}
      {import.meta.env.DEV && (
        <div style={{ marginBottom: 4, fontSize: 11 }}>
          <label>
            <input type="checkbox" checked={g.unlimited} onChange={(e) => g.setUnlimited(e.target.checked)} />
            Dev: Unlimited Energy
          </label>
          <button onClick={g.resetGame} style={{ marginLeft: 8 }}>Dev: Reset</button>
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Board board={g.board} nudge={g.nudge} hint={g.hint} onDrop={g.handleDrop} onGeneratorTap={g.tapGenerator} />
        <Sparkles pos={g.sparkle} />
      </div>
      <div style={{ marginTop: 6, maxHeight: '28vh', overflowY: 'auto', minHeight: 0 }}>
        <OrderPanel orders={g.orders} board={g.board} onServe={g.serveOrder} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button onClick={() => setScreen('play')} style={{ flex: 1 }}>🧩 Board</button>
        <button onClick={() => setScreen('garden')} style={{ flex: 1 }}>🌿 Garden</button>
      </div>
      {screen === 'garden' && (
        <div style={{ position: 'fixed', inset: 0, background: '#fff', padding: 16, overflowY: 'auto', zIndex: 100 }}>
          <h3>Garden Restoration</h3>
          <div style={{ marginBottom: 8 }}>
            <label>Select goal: </label>
            <select value={g.selectedGoalId ?? ''} onChange={(e) => g.selectGoal(e.target.value || null)}>
              <option value="">None</option>
              {g.restorationTasks.map((t) => (
                <option key={t.id} value={t.id} disabled={g.completedRestoration.includes(t.id)}>
                  {t.name} ({t.cost}⭐)
                </option>
              ))}
            </select>
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
      {g.energyToast && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          pointerEvents: 'none',
        }}>
          <div style={{
            background: '#fff3e0',
            border: '1px solid #ffb74d',
            padding: '12px 16px',
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            animation: 'pop 0.3s ease',
            textAlign: 'center',
          }}>
            ⚡ Out of Energy!<br />Next in {formatCountdown(g.energyUpdatedAt)}
          </div>
        </div>
      )}
      {levelUp && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', animation: 'pop 0.6s ease', zIndex: 1001 }}>
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 24 }}>Level Up!</div>
            <div style={{ fontSize: 32 }}>Level {g.level}</div>
            <div>✨</div>
          </div>
        </div>
      )}
    </div>
  );
}
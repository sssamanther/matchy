import { useState } from 'react';
import { useGame } from './hooks/useGame';
import Board from './components/Board';
import Source from './components/Source';
import OrderPanel from './components/OrderPanel';
import GardenLevelBar from './components/GardenLevelBar';
import PlotSelect from './components/PlotSelect';

export default function App() {
  const g = useGame();
  const [screen, setScreen] = useState<'select' | 'play'>('select');

  if (screen === 'select') {
    return (
      <PlotSelect
        onSelect={(i) => {
          g.selectPlot(i);
          setScreen('play');
        }}
      />
    );
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .pop { animation: pop 0.3s ease; }
      `}</style>
      <h1>Matchy 🌱</h1>
      <div style={{ marginBottom: 8 }}>
        Plot {g.plot.id}: {g.plot.name} — stars {g.starsThisPlot}/{g.plot.starQuota}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {g.plot.sources.map((s, i) => (
          <Source key={i} chain={s.chain} onTap={() => g.tapSource(i)} />
        ))}
      </div>
      <Board board={g.board} nudge={g.nudge} hint={g.hint} onDrop={g.handleDrop} />
      <div style={{ marginTop: 12 }}>
        <OrderPanel orders={g.orders} onServe={g.serveOrder} />
      </div>
      <GardenLevelBar stars={g.progress.stars} />
      {g.starsThisPlot >= g.plot.starQuota && (
        <div style={{ marginTop: 12 }}>
          <p>Plot complete! 🎉</p>
          <button onClick={() => { g.nextPlot(); }}>Next plot</button>
          <button onClick={() => setScreen('select')} style={{ marginLeft: 8 }}>Plot select</button>
        </div>
      )}
      <button onClick={() => setScreen('select')} style={{ marginTop: 12 }}>Back to plots</button>
    </div>
  );
}
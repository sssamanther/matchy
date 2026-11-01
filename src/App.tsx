import { useState } from 'react';
import { useGame } from './hooks/useGame';
import Board from './components/Board';

import OrderPanel from './components/OrderPanel';
import GardenLevelBar from './components/GardenLevelBar';
import PlotSelect from './components/PlotSelect';
import PlotComplete from './components/PlotComplete';
import Sparkles from './components/Sparkles';
import EnergyBar from './components/EnergyBar';

export default function App() {
  const g = useGame();
  const [screen, setScreen] = useState<'select' | 'play'>('select');

  if (screen === 'select') {
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
    <div style={{ padding: 16, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
      <style>{`
        @keyframes pop { 0% { transform: scale(1); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        .pop { animation: pop 0.3s ease; }
      `}</style>
      <h1>Matchy 🌱</h1>
      <EnergyBar energy={g.energy} maxEnergy={g.maxEnergy} energyUpdatedAt={g.energyUpdatedAt} />
      {import.meta.env.DEV && (
        <label style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
          <input type="checkbox" checked={g.unlimited} onChange={(e) => g.setUnlimited(e.target.checked)} />
          Dev: Unlimited Energy
        </label>
      )}
      <div style={{ marginBottom: 8 }}>
        Plot {g.plot.id}: {g.plot.name} — stars {g.starsThisPlot}/{g.plot.starQuota}
      </div>
      <div style={{ position: 'relative' }}>
        <Board board={g.board} nudge={g.nudge} hint={g.hint} onDrop={g.handleDrop} onGeneratorTap={g.tapGenerator} />
        <Sparkles pos={g.sparkle} />
      </div>
      <div style={{ marginTop: 12 }}>
        <OrderPanel orders={g.orders} board={g.board} onServe={g.serveOrder} />
      </div>
      <GardenLevelBar stars={g.progress.stars} />
      {g.starsThisPlot >= g.plot.starQuota && (
        <PlotComplete
          plotName={g.plot.name}
          stars={g.starsThisPlot}
          onNext={() => { g.nextPlot(); }}
          onBack={() => setScreen('select')}
        />
      )}
      <button onClick={() => setScreen('select')} style={{ marginTop: 12 }}>Back to plots</button>
    </div>
  );
}
import { useGame } from './hooks/useGame';
import Board from './components/Board';
import Source from './components/Source';
import OrderPanel from './components/OrderPanel';

export default function App() {
  const g = useGame();
  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif', maxWidth: 480, margin: '0 auto' }}>
      <h1>Matchy 🌱</h1>
      <div style={{ marginBottom: 8 }}>
        Plot {g.plot.id}: {g.plot.name} — stars {g.starsThisPlot}/{g.plot.starQuota}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {g.plot.sources.map((s, i) => (
          <Source key={i} chain={s.chain} onTap={() => g.tapSource(i)} />
        ))}
      </div>
      <Board board={g.board} nudge={g.nudge} onDrop={g.handleDrop} />
      <div style={{ marginTop: 12 }}>
        <OrderPanel orders={g.orders} onServe={g.serveOrder} />
      </div>
      {g.starsThisPlot >= g.plot.starQuota && (
        <div style={{ marginTop: 12 }}>
          <p>Plot complete!</p>
          <button onClick={g.nextPlot}>Next plot</button>
        </div>
      )}
    </div>
  );
}
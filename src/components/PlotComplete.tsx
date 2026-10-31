export default function PlotComplete({ plotName, stars, onNext, onBack }: {
  plotName: string; stars: number; onNext: () => void; onBack: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 12, textAlign: 'center' }}>
        <h2>Plot Complete! 🎉</h2>
        <p>{plotName}</p>
        <p>{stars} stars earned</p>
        <button onClick={onNext} style={{ marginRight: 8 }}>Next plot</button>
        <button onClick={onBack}>Plot select</button>
      </div>
    </div>
  );
}
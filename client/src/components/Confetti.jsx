const COLORS = ["#7c5cff", "#ff6b9d", "#22c55e", "#ffb547", "#38bdf8"];
const PIECE_COUNT = 90;

// Deterministic spread in [0, 1) so every burst looks scattered while
// rendering stays pure
const spread = (index, salt) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const PIECES = Array.from({ length: PIECE_COUNT }, (_, index) => ({
  left: `${(spread(index, 1) * 100).toFixed(2)}%`,
  background: COLORS[index % COLORS.length],
  "--delay": `${(spread(index, 2) * 0.6).toFixed(2)}s`,
  "--duration": `${(2.2 + spread(index, 3) * 1.6).toFixed(2)}s`,
  "--drift": `${((spread(index, 4) - 0.5) * 240).toFixed(0)}px`,
  "--spin": `${(360 + spread(index, 5) * 720).toFixed(0)}deg`,
}));

const Confetti = () => (
  <div className="confetti" aria-hidden="true">
    {PIECES.map((style, index) => (
      <span key={index} style={style} />
    ))}
  </div>
);

export default Confetti;

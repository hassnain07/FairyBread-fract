const colours = ['pink', 'yellow', 'teal', 'orange', 'green', 'magenta'];

export function SprinkleField({ count = 18 }: { count?: number }) {
  return (
    <div className="sprinkles" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={colours[i % colours.length]}
          style={{ left: `${(i * 37) % 100}%`, top: `${(i * 61) % 94}%`, transform: `rotate(${i * 31}deg)` }} />
      ))}
    </div>
  );
}

export function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <i key={i} className={colours[i % colours.length]}
          style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 7) * 0.12}s`, animationDuration: `${1.8 + (i % 5) * 0.3}s` }} />
      ))}
    </div>
  );
}

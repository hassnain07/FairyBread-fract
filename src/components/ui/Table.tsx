export function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map(h => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((x, j) => (
                <td key={j}>
                  {j === 0 ? (
                    <strong className="table-name">{x}</strong>
                  ) : j === row.length - 1 ? (
                    <span className={`table-status ${x.toLowerCase().replace(' ', '-')}`}>{x}</span>
                  ) : x}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  text: string;
}

function splitSummary(text: string) {
  return text
    .split(/\s*[·•①②③④⑤⑥⑦⑧⑨⑩；;]\s*/)
    .map((point) => point.trim())
    .filter(Boolean);
}

export function KeyPointsCallout({ text }: Props) {
  if (!text) return null;

  const points = splitSummary(text);

  return (
    <div className="mb-[30px] rounded-r-[10px] border-l-[3px] border-[var(--accent)] bg-[var(--callout-bg)] px-[18px] py-3">
      {points.length > 1 ? (
        <ul className="pl-5 text-[0.9em] leading-[1.8] text-[var(--text-2)]">
          {points.map((point, index) => (
            <li key={index} className="mb-[5px]">
              {point}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.9em] leading-[1.8] text-[var(--text-2)]">{text}</p>
      )}
    </div>
  );
}

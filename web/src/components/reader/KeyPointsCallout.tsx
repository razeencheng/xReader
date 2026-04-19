interface Props {
  text: string;
}

export function KeyPointsCallout({ text }: Props) {
  if (!text) return null;

  return (
    <div className="mb-8 border-l-[3px] border-[var(--border-accent)] bg-[var(--bg-badge-unread)] px-[18px] py-[14px]">
      <div className="mb-1.5 text-[10px] font-bold tracking-[2px] text-[var(--text-warning)]">
        要点
      </div>
      <div className="font-[system-ui] text-sm leading-relaxed text-[var(--text-secondary)]">
        {text}
      </div>
    </div>
  );
}

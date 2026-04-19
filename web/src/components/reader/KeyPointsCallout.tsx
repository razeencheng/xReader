interface Props {
  text: string;
}

export function KeyPointsCallout({ text }: Props) {
  if (!text) return null;

  return (
    <div className="mb-8 border-l-[3px] border-[#d4a24c] bg-[#fff8e6] px-[18px] py-[14px]">
      <div className="mb-1.5 text-[10px] font-bold tracking-[2px] text-[#a07a20]">
        要点
      </div>
      <div className="font-[system-ui] text-sm leading-relaxed text-[#3b3628]">
        {text}
      </div>
    </div>
  );
}

import { PILL_STYLES } from "@/data/journeys";

export const FilterPill: React.FC<{
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant: keyof typeof PILL_STYLES;
}> = ({ label, count, active, onClick, variant }) => {
  const style = PILL_STYLES[variant];
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[13px] transition-colors ${active ? style.active : style.idle}`}
    >
      {label}
      <span
        className={`rounded-full bg-black/30 px-1.5 py-px text-[11px] tabular-nums ${active ? "opacity-90" : "opacity-60"}`}
      >
        {count}
      </span>
    </button>
  );
};

export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-stone-300 bg-white/60 p-8 text-center">
      <div className="text-stone-700 font-medium">{title}</div>
      {hint && <div className="text-sm text-stone-500 mt-1">{hint}</div>}
    </div>
  );
}

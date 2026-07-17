export default function Loading() {
  return (
    <div aria-label="Loading workspace" className="animate-pulse space-y-5">
      <div className="h-8 w-56 rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-[6px] border border-border bg-white" />)}</div>
      <div className="h-96 rounded-[6px] border border-border bg-white" />
    </div>
  );
}

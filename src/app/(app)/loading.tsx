export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-5">
      <div className="skeleton-block h-8 w-56 rounded-[8px]" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-block h-28 rounded-[10px] border border-border" />)}</div>
      <div className="skeleton-block h-96 rounded-[10px] border border-border" />
      <span className="sr-only">Loading workspace</span>
    </div>
  );
}

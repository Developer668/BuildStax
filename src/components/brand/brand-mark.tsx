import { cn } from "@/lib/utils";

export function BrandMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <rect width="48" height="48" rx="10" fill="#151B2B" />
      <path d="M9 28h25l-6 10H7a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 .6-1.4L9 28Z" fill="#5266ED" />
      <path d="M13 20h28l-6 10H10a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 .6-1.4L13 20Z" fill="#F8F7F4" />
      <path d="M20 10h23l-6 10H21v5h-5v-6.5a3 3 0 0 1 .9-2.1L20 10Z" fill="#5266ED" />
    </svg>
  );
}

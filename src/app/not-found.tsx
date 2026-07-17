import { SearchX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="panel max-w-md p-8 text-center">
        <SearchX className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 text-[20px] font-extrabold">Record not found</h1>
        <p className="mt-2 text-[12px] text-muted-foreground">The requested page does not exist or is no longer available.</p>
        <Link href="/" className={buttonVariants({ variant: "dark", className: "mt-5" })}>Go to BuildStax</Link>
      </div>
    </main>
  );
}

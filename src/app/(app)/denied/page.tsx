import { ShieldX } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function DeniedPage() {
  return (
    <div className="panel mx-auto mt-20 max-w-lg p-8 text-center">
      <ShieldX className="mx-auto size-8 text-danger" />
      <h1 className="mt-4 text-[20px] font-extrabold">Permission denied</h1>
      <p className="mt-2 text-[12px] text-muted-foreground">Your account can view this workspace but cannot perform that operation.</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "mt-5" })}>Return to command center</Link>
    </div>
  );
}

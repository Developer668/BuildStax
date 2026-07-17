import { ArrowDown, ArrowRight, Check, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { FeedbackDialog } from "@/components/preview/feedback-dialog";
import { Badge } from "@/components/ui/badge";
import { getPreviewByToken } from "@/lib/db/queries";
import { readBuildArtifact } from "@/lib/builds/artifact";
import { getPreviewContent } from "@/lib/preview-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const row = await getPreviewByToken(token);
  return { title: row ? `${row.business.name} preview` : "Preview", robots: { index: false, follow: false } };
}

export default async function CustomerPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await getPreviewByToken(token);
  if (!row) notFound();
  const { project, business } = row;
  const artifact = await readBuildArtifact(project.id);
  if (artifact) {
    return <div className="min-h-screen bg-[#eef1ed]">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-black/10 bg-white px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2"><Badge tone="success">Verified build</Badge><span className="truncate text-[10px] font-bold">Private customer review · Revision {project.revisionCount} · {artifact.qa.checks.length} release checks passed</span></div>
        <FeedbackDialog token={token} businessName={business.name} />
      </div>
      <iframe src={`/api/preview/${encodeURIComponent(token)}/site`} title={`${business.name} verified website build`} className="block h-[calc(100svh-44px)] w-full border-0 bg-white" />
    </div>;
  }
  const content = getPreviewContent(business.category, business.location, {
    brief: project.brief,
    preferredStyle: business.preferredStyle,
  });

  return (
    <div className={content.surface}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-black/10 bg-white px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2"><Badge tone="warning">Preview</Badge><span className="truncate text-[10px] font-bold">Private customer review · Revision {project.revisionCount}</span></div>
        <FeedbackDialog token={token} businessName={business.name} />
      </div>

      <header className="absolute left-0 right-0 top-11 z-20 flex h-16 items-center justify-between border-b border-white/20 px-5 text-white sm:px-8 lg:px-12">
        <a href="#top" className="text-[15px] font-extrabold">{business.name}</a>
        <nav aria-label="Preview site navigation" className="hidden items-center gap-6 text-[11px] font-bold sm:flex"><a href="#services" className="hover:underline">Services</a><a href="#approach" className="hover:underline">Approach</a><a href="#contact" className="hover:underline">Contact</a></nav>
      </header>

      <main id="top">
        <section className="relative flex min-h-[72svh] items-end overflow-hidden pt-20 text-white sm:min-h-[76svh]">
          <Image src={content.image} alt={content.imageAlt} fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
          <div className="relative z-10 w-full px-5 pb-12 sm:px-8 sm:pb-16 lg:px-12">
            <div className="max-w-[720px]"><div className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/75">{content.kicker}</div><h1 className="mt-4 text-[34px] font-extrabold leading-[1.05] sm:text-[50px]">{business.name}</h1><p className="mt-3 text-[21px] font-semibold leading-tight sm:text-[30px]">{content.headline}</p><p className="mt-5 max-w-xl text-[13px] leading-6 text-white/85 sm:text-[15px]">{content.intro}</p><a href="#contact" className="mt-7 inline-flex h-11 items-center gap-2 rounded-[4px] bg-white px-4 text-[12px] font-extrabold text-[#172018] hover:bg-[#edf0ea]">{content.cta} <ArrowRight className="size-4" /></a></div>
          </div>
          <a href="#services" aria-label="View services" className="absolute bottom-5 right-5 z-10 grid size-9 place-items-center rounded-full border border-white/40 text-white hover:bg-white/10 sm:right-8"><ArrowDown className="size-4" /></a>
        </section>

        <section id="services" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
          <div className="mx-auto max-w-[1180px]"><div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr]"><div><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#667066]">Services</div><h2 className="mt-3 max-w-md text-[27px] font-extrabold leading-tight sm:text-[34px]">Focused work, clearly explained.</h2></div><div className="divide-y divide-black/15 border-y border-black/15">{content.services.map(([title, copy], index) => <article key={title} className="grid gap-3 py-6 sm:grid-cols-[42px_160px_1fr]"><div className="font-mono text-[10px] text-[#596159]">0{index + 1}</div><h3 className="text-[13px] font-extrabold">{title}</h3><p className="max-w-lg text-[12px] leading-5 text-[#5b645c]">{copy}</p></article>)}</div></div></div>
        </section>

        <section id="approach" className={`border-y border-black/10 px-5 py-14 text-white sm:px-8 sm:py-20 lg:px-12 ${content.approachSurface}`}>
          <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-2 lg:items-center"><div className="relative aspect-[4/3] overflow-hidden rounded-[4px]"><Image src={content.image} alt="" fill loading="eager" sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" /></div><div className="max-w-lg"><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-white/60">Our approach</div><h2 className="mt-4 text-[28px] font-extrabold leading-tight sm:text-[36px]">{content.projectTitle}</h2><p className="mt-5 text-[13px] leading-6 text-white/70">{content.projectCopy}</p><ul className="mt-7 space-y-3 text-[11px] font-semibold">{content.principles.map((item) => <li key={item} className="flex items-center gap-2"><span className="grid size-5 place-items-center rounded-full border border-white/25"><Check className="size-3" /></span>{item}</li>)}</ul></div></div>
        </section>

        <section id="contact" className="px-5 py-14 sm:px-8 sm:py-20 lg:px-12"><div className="mx-auto max-w-[1180px]"><div className="grid gap-8 border-b border-black/15 pb-12 lg:grid-cols-[1fr_auto] lg:items-end"><div><div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#667066]">Start a conversation</div><h2 className="mt-3 max-w-2xl text-[28px] font-extrabold leading-tight sm:text-[40px]">Tell us what you need. We’ll make the next step clear.</h2></div><a href={`tel:${business.phone.replace(/[^+\d]/g, "")}`} className={`inline-flex h-11 items-center gap-2 rounded-[4px] px-4 text-[12px] font-bold ${content.primaryAction}`}><Phone className="size-4" /> Call {business.phone}</a></div><div className="flex flex-col gap-3 pt-6 text-[11px] font-semibold text-[#4d574e] sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><MapPin className="size-4" />{business.location}</div><div>© {new Date().getFullYear()} {business.name}</div></div></div></section>
      </main>
    </div>
  );
}

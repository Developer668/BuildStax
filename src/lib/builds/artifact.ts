import "server-only";

import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { Business, Project } from "@/lib/db/schema";

export type BuildArtifact = {
  projectId: string;
  artifactId: string;
  sha256: string;
  createdAt: string;
  html: string;
  files: string[];
  qa: {
    passed: boolean;
    checks: Array<{ name: string; passed: boolean; detail: string }>;
  };
};

const projectIdPattern = /^prj_[A-Za-z0-9_-]{3,160}$/;

function artifactRoot() {
  const configured = process.env.BUILD_ARTIFACT_ROOT?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data", "build-artifacts");
}

function projectDirectory(projectId: string, root = artifactRoot()) {
  if (!projectIdPattern.test(projectId)) throw new Error("The build project identifier is invalid.");
  const directory = path.resolve(root, projectId);
  if (path.relative(root, directory).startsWith("..")) throw new Error("The build artifact path is invalid.");
  return directory;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function cleanText(value: string, max: number) {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function titleFor(business: Business) {
  return cleanText(`${business.name} | ${business.category} in ${business.location}`, 160);
}

function renderSite(business: Business, project: Project) {
  const name = escapeHtml(cleanText(business.name, 160));
  const category = escapeHtml(cleanText(business.category, 120));
  const location = escapeHtml(cleanText(business.location, 160));
  const brief = escapeHtml(cleanText(project.brief || business.requirements, 8_000));
  const style = escapeHtml(cleanText(business.preferredStyle || "Clear, practical, and welcoming.", 800));
  const phone = cleanText(business.phone, 40);
  const phoneHref = phone.replace(/[^+0-9]/g, "");
  const title = escapeHtml(titleFor(business));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${category} in ${location}.">
  <title>${title}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; color: #172018; background: #f5f7f3; }
    * { box-sizing: border-box; } body { margin: 0; } main { max-width: 1040px; margin: 0 auto; padding: 24px; }
    header { padding: 64px 0 48px; border-bottom: 1px solid #d4ddd2; } .eyebrow { color: #526952; font-size: 13px; font-weight: 700; }
    h1 { max-width: 760px; margin: 16px 0; font-size: 52px; line-height: 1.05; } p { max-width: 720px; font-size: 18px; line-height: 1.6; }
    .cta { display: inline-block; margin-top: 18px; padding: 13px 18px; border-radius: 4px; background: #172018; color: #fff; font-weight: 700; text-decoration: none; }
    section { padding: 42px 0; border-bottom: 1px solid #d4ddd2; } h2 { font-size: 27px; } .grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .card { padding: 20px; border: 1px solid #d4ddd2; border-radius: 6px; background: #fff; } .muted { color: #58645a; font-size: 14px; }
    @media (max-width: 680px) { main { padding: 18px; } header { padding: 40px 0 32px; } h1 { font-size: 38px; } .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="eyebrow">${category} · ${location}</div>
      <h1>${name}</h1>
      <p>${brief}</p>
      ${phoneHref ? `<a class="cta" href="tel:${escapeHtml(phoneHref)}">Call ${name}</a>` : ""}
    </header>
    <section>
      <h2>What to expect</h2>
      <div class="grid">
        <article class="card"><strong>Clear service</strong><p class="muted">Useful information and a direct next step for every customer.</p></article>
        <article class="card"><strong>Practical planning</strong><p class="muted">Scope, timing, and questions made easy to understand.</p></article>
        <article class="card"><strong>One accountable handoff</strong><p class="muted">A reliable point of contact from the first question through completion.</p></article>
      </div>
    </section>
    <section><h2>Built around your business</h2><p>${style}</p></section>
  </main>
</body>
</html>`;
}

function runQa(html: string, business: Business) {
  const checks = [
    { name: "document", passed: /^<!doctype html>/i.test(html), detail: "HTML document declaration is present." },
    { name: "viewport", passed: /<meta name="viewport"/i.test(html), detail: "Responsive viewport metadata is present." },
    { name: "primary-content", passed: /<h1>[^<]+<\/h1>/i.test(html), detail: "A business-specific primary heading is present." },
    { name: "unsafe-markup", passed: !/<script\b|javascript:|\son[a-z]+\s*=/i.test(html), detail: "Generated markup contains no executable customer content." },
    { name: "contact-path", passed: !business.phone.trim() || /href="tel:/i.test(html), detail: "A supplied phone number has a usable phone action." },
    { name: "bounded-output", passed: Buffer.byteLength(html) <= 64_000, detail: "Artifact is within the static-delivery size budget." },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

export async function createBuildArtifact(input: { business: Business; project: Project; root?: string }): Promise<BuildArtifact> {
  const root = path.resolve(input.root || artifactRoot());
  const target = projectDirectory(input.project.id, root);
  const temporary = path.join(root, `.tmp-${input.project.id}-${randomUUID()}`);
  const createdAt = new Date().toISOString();
  const html = renderSite(input.business, input.project);
  const qa = runQa(html, input.business);
  if (!qa.passed) throw new Error("The generated site did not pass the required release checks.");
  const sha256 = createHash("sha256").update(html).digest("hex");
  const manifest = { projectId: input.project.id, artifactId: `art_${sha256.slice(0, 24)}`, sha256, createdAt, files: ["index.html", "qa.json", "manifest.json"], qa };

  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(temporary, { recursive: true, mode: 0o700 });
  await Promise.all([
    fs.writeFile(path.join(temporary, "index.html"), html, { encoding: "utf8", mode: 0o600 }),
    fs.writeFile(path.join(temporary, "qa.json"), JSON.stringify(qa, null, 2), { encoding: "utf8", mode: 0o600 }),
    fs.writeFile(path.join(temporary, "manifest.json"), JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 }),
  ]);
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(temporary, target);
  return { ...manifest, html };
}

export async function readBuildArtifact(projectId: string, root?: string): Promise<BuildArtifact | null> {
  try {
    const directory = projectDirectory(projectId, path.resolve(root || artifactRoot()));
    const [manifestRaw, html] = await Promise.all([
      fs.readFile(path.join(directory, "manifest.json"), "utf8"),
      fs.readFile(path.join(directory, "index.html"), "utf8"),
    ]);
    const manifest = JSON.parse(manifestRaw) as Omit<BuildArtifact, "html">;
    if (!manifest || manifest.projectId !== projectId || !Array.isArray(manifest.files) || !manifest.qa) return null;
    const sha256 = createHash("sha256").update(html).digest("hex");
    return sha256 === manifest.sha256 ? { ...manifest, html } : null;
  } catch {
    return null;
  }
}

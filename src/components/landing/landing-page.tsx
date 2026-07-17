"use client";

import {
  ArrowDownRight,
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Hammer,
  LogIn,
  Mic2,
  PhoneCall,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./landing-page.module.css";

type LandingPageProps = {
  phoneDisplay: string;
  phoneHref: string;
};

const steps = [
  {
    number: "01",
    label: "Talk it out",
    body: "Share your business, goals, must-have pages, and visual direction.",
    icon: Mic2,
  },
  {
    number: "02",
    label: "Lock the brief",
    body: "The agent asks one question at a time and confirms the details before saving.",
    icon: ClipboardCheck,
  },
  {
    number: "03",
    label: "Review & build",
    body: "A reviewed quote and secure checkout come next. Building starts after verified payment.",
    icon: Hammer,
  },
] as const;

const tickerItems = ["SPEAK", "BRIEF", "REVIEW", "QUOTE", "BUILD", "REVISE", "DELIVER"];

export function LandingPage({ phoneDisplay, phoneHref }: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealItems = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reduceMotion || !("IntersectionObserver" in window)) {
      revealItems.forEach((item) => item.setAttribute("data-visible", "true"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).setAttribute("data-visible", "true");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16 },
    );
    revealItems.forEach((item) => observer.observe(item));

    const moveScene = (event: PointerEvent) => {
      root.style.setProperty("--pointer-x", `${(event.clientX / window.innerWidth - 0.5) * 12}px`);
      root.style.setProperty("--pointer-y", `${(event.clientY / window.innerHeight - 0.5) * 8}px`);
    };
    window.addEventListener("pointermove", moveScene, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", moveScene);
    };
  }, []);

  async function copyPhone() {
    try {
      await navigator.clipboard.writeText(phoneDisplay);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div ref={rootRef} className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="BuildStax home">
            <span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>
            <span>BUILDSTAX</span>
          </Link>
          <nav className={styles.nav} aria-label="Landing page navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#the-brief">The brief</a>
            <Link href="/login" className={styles.loginLink}>Operator login <LogIn aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.blueprint} aria-hidden="true">
            <i className={styles.lineV1} /><i className={styles.lineV2} /><i className={styles.lineV3} />
            <i className={styles.lineH1} /><i className={styles.lineH2} /><i className={styles.lineH3} />
            <i className={styles.scanLine} />
          </div>

          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <div className={styles.eyebrow}>
                <span className={styles.liveDot} aria-hidden="true" />
                THE AI WEBSITE LINE <span aria-hidden="true">/</span> LIVE NOW
              </div>
              <h1 id="hero-title" className={styles.heroTitle}>BuildStax.</h1>
              <p className={styles.heroPromise}>Call your website into motion.</p>
              <p className={styles.heroDeck}>
                Tell our AI about your business, what the site needs to do, and how it should feel. The conversation becomes a confirmed website brief, ready for review.
              </p>

              <div className={styles.callRow}>
                <a className={styles.callButton} href={phoneHref} aria-label={`Call BuildStax at ${phoneDisplay}`}>
                  <span className={styles.phoneIcon}><PhoneCall aria-hidden="true" /></span>
                  <span><small>CALL BUILDSTAX</small>{phoneDisplay}</span>
                  <ArrowRight className={styles.callArrow} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className={styles.copyButton}
                  onClick={copyPhone}
                  aria-label={copied ? "Phone number copied" : "Copy phone number"}
                  title={copied ? "Copied" : "Copy phone number"}
                >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
                <span className={styles.copyStatus} aria-live="polite">{copied ? "Phone number copied" : ""}</span>
              </div>

              <div className={styles.callMeta}>
                <span>LIVE AI VOICE</span><i aria-hidden="true" /><span>NO SIGNUP REQUIRED</span>
              </div>
              <p className={styles.disclosure}>
                You&apos;ll speak with an AI voice agent. Calls are transcribed, and details you confirm are saved to prepare your website brief. Standard carrier rates may apply. No card details are collected on the call.
              </p>
            </div>

            <div className={styles.heroScene} aria-hidden="true">
              <div className={styles.mascotBubble}><span>STAX // FOREMAN_01</span><strong>LET&apos;S STACK SOMETHING.</strong></div>
              <div className={`${styles.siteBlock} ${styles.siteBlockOne}`}><i /><i /><i /></div>
              <div className={`${styles.siteBlock} ${styles.siteBlockTwo}`}><i /><i /></div>
              <div className={styles.pixelSparkOne}>+</div>
              <div className={styles.pixelSparkTwo}>+</div>
              <Image
                className={styles.mascot}
                src="/mascot/buildstax-foreman.png"
                alt=""
                width={1254}
                height={1254}
                priority
                sizes="(max-width: 760px) 260px, (max-width: 1100px) 380px, 520px"
              />
              <div className={styles.mascotGround} />
            </div>

            <a href="#how-it-works" className={styles.scrollCue}>
              <span>SEE THE FLOW</span><ArrowDownRight aria-hidden="true" />
            </a>
          </div>
        </section>

        <div className={styles.ticker} aria-hidden="true">
          <div className={styles.tickerTrack}>
            {[0, 1].map((set) => (
              <div className={styles.tickerSet} key={set}>
                {tickerItems.map((item) => <span key={`${set}-${item}`}>{item}<i>+</i></span>)}
              </div>
            ))}
          </div>
        </div>

        <section id="how-it-works" className={styles.stepsSection} aria-labelledby="steps-title">
          <div className={styles.sectionInner}>
            <div className={styles.sectionHeading} data-reveal>
              <div className={styles.sectionKicker}>ONE CONVERSATION / THREE MOVES</div>
              <h2 id="steps-title">The shortest distance from idea to site is a conversation.</h2>
            </div>
            <div className={styles.stepsGrid}>
              {steps.map((step, index) => (
                <article className={styles.step} key={step.number} data-reveal style={{ "--delay": `${index * 90}ms` } as React.CSSProperties}>
                  <div className={styles.stepTop}><span>{step.number}</span><step.icon aria-hidden="true" /></div>
                  <h3>{step.label}</h3>
                  <p>{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="the-brief" className={styles.briefSection} aria-labelledby="brief-title">
          <div className={styles.briefInner}>
            <div className={styles.briefCopy} data-reveal>
              <div className={styles.briefKicker}><Sparkles aria-hidden="true" /> FROM VOICE TO VISION</div>
              <h2 id="brief-title">A real brief.<br />Not a guessing game.</h2>
              <p>The agent listens for the details a build needs, confirms them with you, and leaves the team with a clear next move.</p>
              <div className={styles.briefLines}>
                <div><span>01</span><p><strong>BUSINESS</strong> Native garden studio</p><Check aria-hidden="true" /></div>
                <div><span>02</span><p><strong>PAGES</strong> Services, work, inquiry</p><Check aria-hidden="true" /></div>
                <div><span>03</span><p><strong>FEEL</strong> Calm, local, considered</p><Check aria-hidden="true" /></div>
              </div>
            </div>

            <div className={styles.previewWrap} data-reveal>
              <div className={styles.previewLabel}><FileCheck2 aria-hidden="true" /> BRIEF_TO_PREVIEW.build</div>
              <div className={styles.browserFrame}>
                <div className={styles.browserBar}><span /><span /><span /><p>tideandtimber.local</p></div>
                <div className={styles.browserImage}>
                  <Image src="/images/tide-timber-garden.png" alt="A drought-aware garden website concept created from a BuildStax brief" fill sizes="(max-width: 900px) 92vw, 48vw" />
                  <div className={styles.browserOverlay}>
                    <span>EAST BAY / CALIFORNIA</span>
                    <strong>Outdoor spaces,<br />built to belong.</strong>
                    <i>BOOK A CONSULTATION <ArrowRight aria-hidden="true" /></i>
                  </div>
                </div>
              </div>
              <div className={styles.buildStatus}><span /><p>PREVIEW ASSEMBLED</p><strong>03:42</strong></div>
            </div>
          </div>
        </section>

        <section className={styles.finalSection} aria-labelledby="final-title">
          <div className={styles.finalInner} data-reveal>
            <div>
              <span className={styles.finalKicker}>YOUR NEXT SITE STARTS WITH HELLO.</span>
              <h2 id="final-title">One call.<br />A clear next step.</h2>
            </div>
            <a className={styles.finalCall} href={phoneHref} aria-label={`Call the BuildStax AI at ${phoneDisplay}`}>
              <PhoneCall aria-hidden="true" />
              <span><small>CALL THE BUILDSTAX AI</small>{phoneDisplay}</span>
              <ArrowDownRight aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div><span>BUILDSTAX</span><p>Websites, started by voice.</p></div>
        <p>AI-assisted website intake. Human-reviewed next steps.</p>
        <Link href="/login">Operator access</Link>
      </footer>
    </div>
  );
}

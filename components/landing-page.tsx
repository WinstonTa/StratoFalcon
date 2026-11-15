"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { DESTINATIONS } from "@/lib/sim/destinations";

import "@/app/landing.css";

const GITHUB_URL = "https://github.com/WinstonTa/StratoFalcon";
const START_ALTITUDE_FT = 2400;

/** The place used for the fly-then-land scroll sequence. */
const DESCENT = DESTINATIONS.find((place) => place.id === "paris") ?? DESTINATIONS[0];
const HERO = DESTINATIONS.find((place) => place.id === "venice-beach") ?? DESTINATIONS[0];

const DESCENT_CAPTIONS = [
  "Pick a real place and fly over it. The video is generated live, a couple of seconds at a time.",
  "Steer with the keyboard, your voice, or plain words. Call in a storm, a sunset, fireworks.",
  "Then land, and walk the same streets while a guide tells you where you are.",
];

/** What one key press turns into, in order. */
const LOG_LINES: { kind: string; text: string }[] = [
  { kind: "Input", text: "Key D" },
  { kind: "State", text: "bank: level → right" },
  {
    kind: "Prompt",
    text: "The aerial POV camera, flying steadily, swings into a hard turn, the scene sliding left across the frame.",
  },
  { kind: "Orbis", text: "Applied at the next chunk, about two seconds later" },
  { kind: "Guide", text: "“That's the Venice boardwalk coming up on your right.”" },
];

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="22" height="22" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function CallsToAction() {
  return (
    <div className="lp-cta-row">
      <Link className="lp-cta lp-cta-primary" href="/demo">
        Try out the demo!
      </Link>
      <a
        className="lp-cta lp-cta-ghost"
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        <GitHubMark />
        See the project on GitHub!
      </a>
    </div>
  );
}

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const altitude = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    gsap.registerPlugin(ScrollTrigger);
    if (process.env.NODE_ENV !== "production") {
      // Development only: lets the animation clock be stepped by hand when the
      // page is rendered somewhere that pauses requestAnimationFrame.
      Object.assign(window, { __landingGsap: { gsap, ScrollTrigger } });
    }
    const media = gsap.matchMedia();

    media.add("(prefers-reduced-motion: no-preference)", () => {
      // Scoped by gsap.context so every tween, pin and inline style is undone
      // on unmount or when the media query stops matching.
      const context = gsap.context(() => {
        scope.dataset.animated = "true";

        // --- Hero: one load sequence, then a slow drift on scroll -----------
        gsap
          .timeline({ defaults: { ease: "power3.out" } })
          .from(".lp-hero-photo", { scale: 1.12, duration: 2.4, ease: "power2.out" }, 0)
          .from(".lp-reticle-line", { scaleX: 0, duration: 1.1, stagger: 0.08 }, 0.15)
          .from(".lp-reticle-corner", { opacity: 0, scale: 1.25, duration: 0.7, stagger: 0.05 }, 0.5)
          // The two buttons are the page's whole job, so they are never hidden:
          // they only settle into place. If the animation clock is paused (a
          // background tab), they are still there to click.
          .from(".lp-title", { letterSpacing: "0.16em", duration: 1.6, ease: "power2.out" }, 0)
          .from(".lp-hero .lp-cta", { y: 22, duration: 0.8, stagger: 0.12 }, 0.3)
          .from(".lp-scroll-cue", { y: -10, duration: 0.8 }, 0.9);

        gsap.to(".lp-hero-photo", {
          yPercent: 14,
          ease: "none",
          scrollTrigger: { trigger: ".lp-hero", start: "top top", end: "bottom top", scrub: true },
        });

        // --- Descent: the aerial photo gives way to street level ------------
        const stage = scope.querySelector<HTMLElement>(".lp-descent-stage");
        const captions = gsap.utils.toArray<HTMLElement>(".lp-caption");
        const descent = { progress: 0 };
        gsap.set(captions, { opacity: 0, y: 18 });

        const descentTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: ".lp-descent",
            start: "top top",
            end: "+=240%",
            pin: true,
            scrub: 0.6,
          },
        });
        descentTimeline.to(
          descent,
          {
            progress: 1,
            duration: 1,
            ease: "none",
            onUpdate: () => {
              stage?.style.setProperty("--descent", descent.progress.toFixed(4));
              if (altitude.current) {
                const feet = Math.round((START_ALTITUDE_FT * (1 - descent.progress)) / 10) * 10;
                altitude.current.textContent = feet.toLocaleString("en-US");
              }
            },
          },
          0,
        );
        captions.forEach((caption, index) => {
          const start = index / captions.length;
          const span = 1 / captions.length;
          descentTimeline.to(caption, { opacity: 1, y: 0, duration: span * 0.3 }, start + span * 0.05);
          if (index < captions.length - 1) {
            descentTimeline.to(caption, { opacity: 0, y: -18, duration: span * 0.25 }, start + span * 0.75);
          }
        });

        // --- Destinations: the strip travels sideways as you scroll ---------
        const track = scope.querySelector<HTMLElement>(".lp-strip-track");
        if (track) {
          const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
          gsap.to(track, {
            x: () => -distance(),
            ease: "none",
            scrollTrigger: {
              trigger: ".lp-strip",
              start: "top top",
              end: () => `+=${distance()}`,
              pin: true,
              scrub: 0.5,
              invalidateOnRefresh: true,
            },
          });
        }

        // --- How it works: the log writes itself once -----------------------
        gsap.from(".lp-log-line", {
          opacity: 0,
          x: -24,
          duration: 0.5,
          stagger: 0.28,
          ease: "power2.out",
          scrollTrigger: { trigger: ".lp-log", start: "top 72%", once: true },
        });
      }, scope);

      return () => {
        context.revert();
        delete scope.dataset.animated;
      };
    });

    return () => media.revert();
  }, []);

  return (
    <div className="lp" ref={root}>
      <section className="lp-hero" aria-label="StratoFalcon">
        <div className="lp-hero-photo" aria-hidden="true">
          <Image src={HERO.aerialImage} alt="" fill priority sizes="100vw" />
        </div>
        <div className="lp-hero-shade" aria-hidden="true" />

        <div className="lp-hero-center">
          <div className="lp-reticle" aria-hidden="true">
            <span className="lp-reticle-line lp-reticle-line-left" />
            <span className="lp-reticle-line lp-reticle-line-right" />
            <span className="lp-reticle-corner lp-corner-tl" />
            <span className="lp-reticle-corner lp-corner-tr" />
            <span className="lp-reticle-corner lp-corner-bl" />
            <span className="lp-reticle-corner lp-corner-br" />
          </div>

          <h1 className="lp-title">StratoFalcon</h1>
          <p className="lp-visually-hidden">
            Fly over real places in live generated video, then land and explore.
          </p>
          <CallsToAction />
        </div>

        <p className="lp-scroll-cue">Scroll to see how it works</p>
      </section>

      <section className="lp-descent" aria-label="Fly, then land">
        <div className="lp-descent-stage">
          <div className="lp-descent-ground">
            <Image
              src={DESCENT.groundImage}
              alt={`Street-level view of ${DESCENT.name}`}
              fill
              sizes="100vw"
            />
          </div>
          <div className="lp-descent-air">
            <Image
              src={DESCENT.aerialImage}
              alt={`Aerial view of ${DESCENT.name}`}
              fill
              sizes="100vw"
            />
          </div>
          <div className="lp-descent-horizon" aria-hidden="true" />
          <div className="lp-descent-shade" aria-hidden="true" />

          <p className="lp-altitude" aria-hidden="true">
            <span className="lp-altitude-value" ref={altitude}>
              {START_ALTITUDE_FT.toLocaleString("en-US")}
            </span>
            <span className="lp-altitude-unit">ft above {DESCENT.name}</span>
          </p>

          <div className="lp-captions">
            {DESCENT_CAPTIONS.map((caption) => (
              <p className="lp-caption" key={caption}>
                {caption}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-strip" aria-label="Destinations">
        <div className="lp-strip-head">
          <h2>Six places to start from, or bring your own photo</h2>
        </div>
        <ul className="lp-strip-track">
          {DESTINATIONS.map((place) => (
            <li className="lp-place" key={place.id}>
              <div className="lp-place-photo">
                <Image
                  src={place.aerialImage}
                  alt={`Aerial view of ${place.name}`}
                  fill
                  sizes="(max-width: 700px) 80vw, 46vw"
                />
              </div>
              <h3>{place.name}</h3>
              <p>{place.tagline}</p>
            </li>
          ))}
          <li className="lp-place lp-place-own">
            <h3>Your photo</h3>
            <p>
              Upload any picture. Gemini works out where it is, the flight starts from it,
              and a street-level view is prepared while you fly.
            </p>
          </li>
        </ul>
      </section>

      <section className="lp-how" aria-label="How it works">
        <div className="lp-how-text">
          <h2>Every key press becomes one sentence</h2>
          <p>
            The video comes from Visko Orbis, a live world model that only takes text. So
            StratoFalcon keeps the aircraft as plain state — turn, climb, speed, weather —
            and rewrites that state as a single camera instruction whenever it changes.
          </p>
          <p>
            Keys and buttons never wait on a language model. Gemini steps in only for what
            needs understanding: typed and spoken commands, the guide, and recognising an
            uploaded photo.
          </p>
          <p>
            The panel beside the video shows all of it as it happens, so you can see exactly
            what was asked of the model and when it took effect.
          </p>
        </div>

        <ol className="lp-log" aria-label="What one key press turns into">
          {LOG_LINES.map((line) => (
            <li className={`lp-log-line lp-log-${line.kind.toLowerCase()}`} key={line.kind}>
              <span className="lp-log-kind">{line.kind}</span>
              <span className="lp-log-text">{line.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="lp-footer">
        <h2>Take it up</h2>
        <CallsToAction />
        <p className="lp-credits">
          Built in a day at Build Day with Live Models, on Visko Orbis hosted by Reactor,
          with Google Gemini and Next.js.
        </p>
      </footer>
    </div>
  );
}

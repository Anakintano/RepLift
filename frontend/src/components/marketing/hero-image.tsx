"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { withBasePath } from "@/lib/base-path";

/**
 * Full-bleed hero photo with a small scroll-linked parallax on the image layer only —
 * the text column above it stays static so it's never at risk of becoming unreadable.
 */
export function HeroImage() {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], prefersReducedMotion ? [0, 0] : [0, 32]);

  return (
    <div ref={ref} className="absolute inset-0 -z-10 overflow-hidden">
      <motion.div style={{ y }} className="absolute inset-0 -top-8">
        <Image
          src={withBasePath("/images/hero-deadlift.jpg")}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
      </motion.div>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/55 via-slate-950/75 to-background grain-overlay" />
    </div>
  );
}

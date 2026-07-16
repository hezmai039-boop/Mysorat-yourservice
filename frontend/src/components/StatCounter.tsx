import { useEffect, useRef, useState } from "react";

export function StatCounter({
  target,
  suffix = "",
  decimals = 0,
}: {
  target: number | undefined;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (target === undefined) return;
    const el = ref.current;
    if (!el) return;

    const format = (n: number) => `${n.toFixed(decimals)}${suffix}`;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = () => {
      if (animated.current) return;
      animated.current = true;
      if (reduceMotion) {
        setDisplay(format(target));
        return;
      }
      const duration = 1300;
      let start: number | null = null;
      const step = (ts: number) => {
        if (start === null) start = ts;
        const progress = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(format(target * eased));
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate();
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, suffix, decimals]);

  return <span ref={ref}>{display}</span>;
}

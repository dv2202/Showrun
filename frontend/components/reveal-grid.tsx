"use client";

import { useEffect, useRef, useState } from "react";

export function RevealGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.18 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`landing-reveal-grid ${className}`} data-visible={visible} ref={ref}>
      {children}
    </div>
  );
}

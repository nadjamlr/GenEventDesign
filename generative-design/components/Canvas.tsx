"use client";

import { useEffect, useRef } from "react";
import p5 from "p5";
import useDesignStore from "@/store/designstore";
import { drawGrid } from "@/algorithms/grid";

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columns, rows } = useDesignStore();

  // ref hält immer die aktuellen Werte, ohne p5 neu erstellen zu müssen
  const paramsRef = useRef({ columns, rows });
  paramsRef.current = { columns, rows };

  useEffect(() => {
    if (!containerRef.current) return;

    const instance = new p5((p: p5) => {
      p.setup = () => {
        p.createCanvas(
          containerRef.current!.clientWidth,
          containerRef.current!.clientHeight
        );
      };
      p.draw = () => {
        drawGrid(p, paramsRef.current);
      };
    }, containerRef.current);

    return () => instance.remove();
  }, []);

  return <div ref={containerRef} className="w-full h-full" />;
}

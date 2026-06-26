"use client";

import { useState, useRef } from "react";

type SliderProps = {
  label?: string;
  range?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
};

export default function Slider({ range = 5, defaultValue = 0, onChange }: SliderProps) {
  const [value, setValue] = useState(defaultValue);
  const trackRef = useRef<HTMLDivElement>(null);

  function getValueFromX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const { left, width } = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - left) / width));
    return Math.round(ratio * range);
  }

  function update(clientX: number) {
    const next = getValueFromX(clientX);
    setValue(next);
    onChange?.(next);
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    update(e.clientX);

    function onMove(e: MouseEvent) { update(e.clientX); }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function handleTouchStart(e: React.TouchEvent) {
    update(e.touches[0].clientX);

    function onMove(e: TouchEvent) { update(e.touches[0].clientX); }
    function onEnd() {
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
    }
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onEnd);
  }

  const fillPercent = (value / range) * 100;
  return (
    <div className="w-full px-2 select-none">
      <div
        ref={trackRef}
        className="relative h-4 flex items-center cursor-pointer"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* track background */}
        <div className="absolute inset-x-0 h-[2px] bg-primary-lightgrey rounded-full" />

        {/* filled track */}
        <div
          className="absolute left-0 h-[2px] bg-primary-color rounded-full transition-none"
          style={{ width: `${fillPercent}%` }}
        />


        {/* handle */}
        <div
          className={`absolute w-3 h-3 rounded-full -translate-x-1/2 transition-colors cursor-grab active:cursor-grabbing ${
            value > 0 ? "bg-primary-color" : "bg-primary-darkgrey"
          }`}
          style={{ left: `${fillPercent}%` }}
        />
      </div>

    </div>
  );
}

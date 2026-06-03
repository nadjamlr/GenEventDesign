"use client";

import { useState } from "react";

type InputfieldProps = {
  unit?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
};

export default function Inputfield({ unit, placeholder, onChange }: InputfieldProps) {
  const [value, setValue] = useState("");
  const isNumber = !!unit;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (isNumber && raw !== "" && !/^\d*$/.test(raw)) return;
    setValue(raw);
    onChange?.(raw);
  }

  return (
    <div className="flex items-center gap-1 w-full bg-primary-lightgrey rounded-sm px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary-color">
      <input
        value={value}
        onChange={handleChange}
        inputMode={isNumber ? "numeric" : "text"}
        placeholder={placeholder ?? (isNumber ? "0" : "...")}
        className="w-full bg-transparent text-primary-black text-xs outline-none placeholder:text-primary-darkgrey"
      />
      {unit && (
        <span className="text-xs text-primary-darkgrey shrink-0">{unit}</span>
      )}
    </div>
  );
}

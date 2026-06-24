"use client";

import { useState } from "react";

type InputfieldProps = {
  unit?: string;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onEnter?: (value: string) => void;
  disabled?: boolean;
};

export default function Inputfield({ unit, placeholder, value: controlledValue, onChange, onEnter, disabled }: InputfieldProps) {
  const [internalValue, setInternalValue] = useState("");
  const value = controlledValue ?? internalValue;
  const isNumber = !!unit;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (isNumber && raw !== "" && !/^\d*$/.test(raw)) return;
    setInternalValue(raw);
    onChange?.(raw);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      onEnter?.(value);
    }
  }

  return (
    <div
      className={`flex items-center gap-1 w-full bg-primary-lightgrey rounded-sm px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary-color ${
        disabled ? "opacity-50" : ""
      }`}
    >
      <input
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        inputMode={isNumber ? "numeric" : "text"}
        placeholder={placeholder ?? (isNumber ? "0" : "...")}
        className="w-full bg-transparent text-primary-black text-xs outline-none placeholder:text-primary-darkgrey disabled:cursor-not-allowed"
      />
      {unit && (
        <span className="text-xs text-primary-darkgrey shrink-0">{unit}</span>
      )}
    </div>
  );
}

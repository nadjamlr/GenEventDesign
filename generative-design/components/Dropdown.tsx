"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

type DropdownProps = {
  label?: string;
  fields?: string[];
  /** Wenn gesetzt, zeigt das Dropdown diesen Wert an (controlled), statt nur die eigene Auswahl zu merken. */
  value?: string | null;
  onChange?: (value: string) => void;
};

export default function Dropdown({ label = "Choose", fields = [], value, onChange }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const selected = value !== undefined ? value : internalSelected;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(value: string) {
    setInternalSelected(value);
    setIsOpen(false);
    onChange?.(value);
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 bg-primary-lightgrey text-primary-darkgrey rounded-sm text-xs hover:opacity-80 transition-opacity"
      >
        <span>{selected ?? label}</span>
        <ChevronDown
          size={16}
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-primary-lightgrey text-primary-black rounded-sm shadow-lg overflow-hidden">
          {fields.map((field) => (
            <li key={field}>
              <button
                type="button"
                onClick={() => handleSelect(field)}
                className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-100 transition-colors ${
                  selected === field ? "font-semibold" : ""
                }`}
              >
                {field}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

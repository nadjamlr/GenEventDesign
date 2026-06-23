"use client";

import { useState } from "react"
import { saveAs } from "file-saver"
import jsPDF from "jspdf"
import Button from "./Button"
import Slider from "./Slider"
import Dropdown from "./Dropdown"
import Inputfield from "./Inputfield"
import RulerItem from "./RulerItem"
import RulerSection from "./RulerSection"
import SeparationLine from "./SeperationLine"
import ShapeButton from "./ShapeButton"
import ColorButton from "./ColorButton"
import useDesignStore from "@/store/designStore"
import { shapes } from "@/lib/shapes"
import { DEFAULT_COLORS, normalizeHex } from "@/lib/colors"
import { exportRegistry } from "@/lib/canvasExport"

const EXPORT_TYPES = ["png", "pdf"] as const;

export default function Sidebar() {
  const {
    format,
    setColumns,
    setRows,
    setFormat,
    width,
    height,
    setWidth,
    setHeight,
    exportType,
    setExportType,
    selectedShapes,
    toggleShape,
    customColors,
    selectedColors,
    toggleColor,
    addCustomColor,
    regenerate,
  } = useDesignStore();

  const [hexInput, setHexInput] = useState("");
  const [exportName, setExportName] = useState("");

  function handleHexEnter(value: string) {
    const normalized = normalizeHex(value);
    if (!normalized) return;
    addCustomColor(normalized);
    setHexInput("");
  }

  async function handleExport() {
    if (!exportRegistry.render) return;
    const { dataUrl, width, height } = exportRegistry.render();
    const filename = exportName.trim() || "export";

    if (exportType === "pdf") {
      const pdf = new jsPDF({
        orientation: width >= height ? "landscape" : "portrait",
        unit: "px",
        format: [width, height],
      });
      pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
      pdf.save(`${filename}.pdf`);
    } else {
      const blob = await (await fetch(dataUrl)).blob();
      saveAs(blob, `${filename}.png`);
    }
  }

  const colors = [...DEFAULT_COLORS, ...customColors.map((hex) => ({ id: hex, hex }))];

  return (
    <div className="fixed top-0 right-0 h-screen w-78 bg-primary-black flex flex-col gap-6 px-5 py-8 overflow-y-auto">
      <img src="/logoShapes/Logo_NRLY_White.svg" alt="NRLY" className="h-8 w-auto" />
      <div className="flex flex-col gap-6">
        <RulerSection heading="Format">
          <RulerItem label="Size">
            <Inputfield
              placeholder="1000"
              unit="W"
              value={String(width)}
              onChange={(v) => setWidth(Number(v) || 0)}
            />
            <Inputfield
              placeholder="1000"
              unit="H"
              value={String(height)}
              onChange={(v) => setHeight(Number(v) || 0)}
            />
          </RulerItem>
          <RulerItem label="Format">
            <Dropdown
              label="Choose"
              fields={["Social Post", "Poster", "Flyer", "Video", "Business Card", "Ticket", "Voucher", "Sticker", "Skateboard"]}
              onChange={setFormat}
            />
          </RulerItem>
          <RulerItem label="Columns">
            <Slider range={20} onChange={setColumns}/>
          </RulerItem>
          <RulerItem label="Rows">
            <Slider range={20} onChange={setRows}/>
          </RulerItem>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Input">
          <RulerItem label="Text">
            <Inputfield />
          </RulerItem>
          <RulerItem label="Media">
            <Button text="Upload" color="grey" />
          </RulerItem>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Colors">
          <div className="grid grid-cols-5 gap-2 px-2">
            {colors.map((color) => (
              <ColorButton
                key={color.id}
                hex={color.hex}
                selected={selectedColors.includes(color.hex)}
                onClick={() => toggleColor(color.hex)}
              />
            ))}
          </div>
          <RulerItem label="Hex">
            <Inputfield
              placeholder="#2F00FF"
              value={hexInput}
              onChange={setHexInput}
              onEnter={handleHexEnter}
            />
          </RulerItem>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Shape">
          <div className="grid grid-cols-3 gap-2 px-2">
            {shapes.map((shape) => (
              <ShapeButton
                key={shape.id}
                label={shape.label}
                src={shape.src}
                selected={selectedShapes.includes(shape.id)}
                onClick={() => toggleShape(shape.id)}
              />
            ))}
          </div>
          <div className="flex flex-col w-full items-center px-2 mt-2">
            <Button size="sm" text="Shuffle" color="grey" onClick={regenerate} />
          </div>
        </RulerSection>

        <SeparationLine/>
        
        <RulerSection heading="Export">
          <RulerItem label="Name">
            <Inputfield
              placeholder="Name"
              value={exportName}
              onChange={setExportName}
            />
          </RulerItem>
          {format !== "Video" && (
            <RulerItem label="Type">
              <div className="flex gap-2 w-full">
                {EXPORT_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setExportType(type)}
                    className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                      exportType === type
                        ? "bg-primary-color text-white"
                        : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </RulerItem>
          )}
        </RulerSection>

        <div className="flex flex-col w-full items-center">
          <Button size="sm" text="Export" onClick={handleExport} />
        </div>
        
      </div>
    </div>
  )
}

"use client";

import { useEffect, useRef, useState } from "react"
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
import { getInputFields } from "@/lib/inputFields"
import { ALL_ANCHORS, ANCHOR_LABELS, type LogoAnchor } from "@/lib/logoPlacement"
import { hasSides, type Side } from "@/lib/formats"
import type { LogoMode } from "@/algorithms/grid"
import {
  type AreaKind,
  type AreaAnchor,
  DEFAULT_IMAGE_AREA_SIZE,
  DEFAULT_TEXT_AREA_SIZE,
} from "@/lib/areas"

const EXPORT_TYPES = ["png", "pdf"] as const;
const SIDES: Side[] = ["front", "back"];
const AREA_KINDS: AreaKind[] = ["text", "image"];
const NO_IMAGE_AREA_FORMATS = ["Business Card", "Ticket", "Voucher"];
const LOGO_MODES: LogoMode[] = ["random", "logo", "icon"];
const LOGO_MODE_LABELS: Record<LogoMode, string> = { random: "Random", logo: "Logo", icon: "Icon" };
const ANCHOR_OPTIONS = ALL_ANCHORS.map((a) => ANCHOR_LABELS[a]);
const SHAPE_OPTIONS = shapes.map((s) => s.label);
const BACKGROUND_LABEL = "Hintergrund";

function labelToAnchor(label: string): AreaAnchor {
  if (label === BACKGROUND_LABEL) return "background";
  return ALL_ANCHORS.find((a) => ANCHOR_LABELS[a] === label) ?? "center";
}

function labelToShapeId(label: string): string | undefined {
  return shapes.find((s) => s.label === label)?.id;
}

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
    inputValues,
    setInputValue,
    areas,
    addArea,
    removeArea,
    side,
    setSide,
    logoEnabled,
    setLogoEnabled,
    logoMode,
    setLogoMode,
    animate,
    setAnimate,
    loopDuration,
    setLoopDuration,
  } = useDesignStore();

  const [hexInput, setHexInput] = useState("");
  const [exportName, setExportName] = useState("");
  const [exporting, setExporting] = useState(false);

  const [areaKind, setAreaKind] = useState<AreaKind>("text");
  const [areaAnchor, setAreaAnchor] = useState<AreaAnchor>("center");
  const [areaShapeId, setAreaShapeId] = useState<string | undefined>(shapes[0]?.id);
  const [areaText, setAreaText] = useState("");
  const [areaImageDataUrl, setAreaImageDataUrl] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowImageAreas = !NO_IMAGE_AREA_FORMATS.includes(format);
  const availableAreaKinds = allowImageAreas ? AREA_KINDS : AREA_KINDS.filter((k) => k !== "image");

  useEffect(() => {
    if (!allowImageAreas && areaKind === "image") setAreaKind("text");
  }, [allowImageAreas, areaKind]);

  // "Hintergrund" gibt es nur für Bild-Areas; bei Text zurück auf eine Position.
  useEffect(() => {
    if (areaKind === "text" && areaAnchor === "background") setAreaAnchor("center");
  }, [areaKind, areaAnchor]);

  function handleAreaImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAreaImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleAddArea() {
    if (areaKind === "text") {
      if (!areaText.trim()) return;
      addArea({ kind: "text", anchor: areaAnchor, text: areaText, ...DEFAULT_TEXT_AREA_SIZE });
      setAreaText("");
    } else {
      if (!areaImageDataUrl) return;
      if (areaAnchor === "background") {
        // Hintergrund-Bild: keine Maske/Shape nötig, füllt den ganzen Rahmen.
        addArea({
          kind: "image",
          anchor: "background",
          imageDataUrl: areaImageDataUrl,
          ...DEFAULT_IMAGE_AREA_SIZE,
        });
      } else {
        if (!areaShapeId) return;
        addArea({
          kind: "image",
          anchor: areaAnchor,
          shapeId: areaShapeId,
          imageDataUrl: areaImageDataUrl,
          ...DEFAULT_IMAGE_AREA_SIZE,
        });
      }
      setAreaImageDataUrl(undefined);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleHexEnter(value: string) {
    const normalized = normalizeHex(value);
    if (!normalized) return;
    addCustomColor(normalized);
    setHexInput("");
  }

  async function handleSnapshot() {
    if (!exportRegistry.renderFrame) return;
    const { dataUrl } = exportRegistry.renderFrame();
    const blob = await (await fetch(dataUrl)).blob();
    const filename = exportName.trim() || "snapshot";
    const suffix = hasSides(format) ? `_${side}` : "";
    saveAs(blob, `${filename}${suffix}_${Date.now()}.png`);
  }

  async function handleExport() {
    const filename = exportName.trim() || "export";

    // Video-Format: nahtlose Loop als WebM aufnehmen (läuft in Echtzeit).
    if (format === "Video") {
      if (!exportRegistry.renderVideo || exporting) return;
      setExporting(true);
      try {
        const blob = await exportRegistry.renderVideo({ duration: loopDuration, fps: 30 });
        saveAs(blob, `${filename}.webm`);
      } finally {
        setExporting(false);
      }
      return;
    }

    if (!exportRegistry.render) return;

    if (exportType === "pdf" && hasSides(format)) {
      // Formate mit Vorder-/Rückseite: immer beide Seiten als 2-Seiten-PDF.
      const front = exportRegistry.render("front");
      const back = exportRegistry.render("back");
      const pdf = new jsPDF({
        orientation: front.width >= front.height ? "landscape" : "portrait",
        unit: "px",
        format: [front.width, front.height],
      });
      pdf.addImage(front.dataUrl, "PNG", 0, 0, front.width, front.height);
      pdf.addPage([back.width, back.height], back.width >= back.height ? "landscape" : "portrait");
      pdf.addImage(back.dataUrl, "PNG", 0, 0, back.width, back.height);
      pdf.save(`${filename}.pdf`);
      return;
    }

    const { dataUrl, width, height } = exportRegistry.render();
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
      const suffix = hasSides(format) ? `_${side}` : "";
      saveAs(blob, `${filename}${suffix}.png`);
    }
  }

  const colors = [...DEFAULT_COLORS, ...customColors.map((hex) => ({ id: hex, hex }))];
  const formatHasSides = hasSides(format);
  const inputFields = getInputFields(format, formatHasSides ? side : undefined);
  const showInputSection = inputFields.length > 0;

  return (
    <div className="fixed top-0 right-0 h-screen w-78 bg-primary-black flex flex-col gap-6 px-5 py-8 overflow-y-auto">
      <img src="/logoShapes/Logo_NRLY_White.svg" alt="NRLY" className="h-8 w-auto" />
      <div className="flex flex-col gap-6">
        <RulerSection heading="Format">
          <RulerItem label="Format">
            <Dropdown
              label="Choose"
              fields={["Social Post", "Poster", "Flyer", "Video", "Business Card", "Ticket", "Voucher", "Sticker", "Skateboard"]}
              onChange={setFormat}
            />
          </RulerItem>
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
          {formatHasSides && (
            <RulerItem label="Side">
              <div className="flex gap-2 w-full">
                {SIDES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                      side === s
                        ? "bg-primary-color text-white"
                        : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                    }`}
                  >
                    {s === "front" ? "Vorne" : "Hinten"}
                  </button>
                ))}
              </div>
            </RulerItem>
          )}
        </RulerSection>

        <SeparationLine/>

        <RulerSection
          heading="Layout">
          <RulerItem label="Columns">
            <Slider range={20} onChange={setColumns}/>
          </RulerItem>
          <RulerItem label="Rows">
            <Slider range={20} onChange={setRows}/>
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

        <RulerSection heading="Areas">
          <RulerItem label="Kind">
            <div className="flex gap-2 w-full">
              {availableAreaKinds.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setAreaKind(kind)}
                  className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                    areaKind === kind
                      ? "bg-primary-color text-white"
                      : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                  }`}
                >
                  {kind === "text" ? "Text" : "Bild"}
                </button>
              ))}
            </div>
          </RulerItem>
          <RulerItem label="Position">
            <Dropdown
              key={areaKind}
              label="Choose"
              fields={areaKind === "image" ? [...ANCHOR_OPTIONS, BACKGROUND_LABEL] : ANCHOR_OPTIONS}
              onChange={(label) => setAreaAnchor(labelToAnchor(label))}
            />
          </RulerItem>

          {areaKind === "text" ? (
            <RulerItem label="Text">
              <Inputfield placeholder="Text" value={areaText} onChange={setAreaText} />
            </RulerItem>
          ) : (
            <>
              {areaAnchor !== "background" && (
                <RulerItem label="Shape">
                  <Dropdown
                    label="Choose"
                    fields={SHAPE_OPTIONS}
                    onChange={(label) => setAreaShapeId(labelToShapeId(label))}
                  />
                </RulerItem>
              )}
              <RulerItem label="Bild">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAreaImageChange}
                />
                <Button
                  text={areaImageDataUrl ? "Bild gewählt" : "Upload"}
                  color="grey"
                  onClick={() => fileInputRef.current?.click()}
                />
              </RulerItem>
            </>
          )}

          <div className="flex flex-col w-full items-center px-2 mt-2">
            <Button size="sm" text="Add Area" onClick={handleAddArea} />
          </div>

          {areas.length > 0 && (
            <div className="flex flex-col gap-1 px-2 mt-2">
              {areas.map((area) => (
                <div
                  key={area.id}
                  className="flex items-center justify-between gap-2 bg-primary-lightgrey rounded-sm px-3 py-1.5 text-xs text-primary-darkgrey"
                >
                  <span className="truncate">
                    {area.kind === "text" ? "Text" : "Bild"} ·{" "}
                    {area.anchor === "background" ? BACKGROUND_LABEL : ANCHOR_LABELS[area.anchor]}
                    {area.kind === "text" ? `: ${area.text}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeArea(area.id)}
                    className="shrink-0 text-primary-black hover:opacity-60"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </RulerSection>

        {showInputSection && (
          <>
            <SeparationLine/>

            <RulerSection heading="Input">
              {inputFields.map((field) => (
                <RulerItem key={field.key} label={field.label}>
                  <Inputfield
                    placeholder={field.label}
                    disabled={field.locked}
                    value={field.locked ? field.defaultValue ?? "" : inputValues[field.key] ?? ""}
                    onChange={field.locked ? undefined : (v) => setInputValue(field.key, v)}
                  />
                </RulerItem>
              ))}
            </RulerSection>
          </>
        )}

        <SeparationLine/>

        <RulerSection heading="Logo">
          <RulerItem label="Visible">
            <div className="flex gap-2 w-full">
              <button
                type="button"
                onClick={() => setLogoEnabled(true)}
                className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                  logoEnabled
                    ? "bg-primary-color text-white"
                    : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                }`}
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setLogoEnabled(false)}
                className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                  !logoEnabled
                    ? "bg-primary-color text-white"
                    : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                }`}
              >
                No
              </button>
            </div>
          </RulerItem>

          {logoEnabled && (
            <RulerItem label="Version">
              <div className="flex gap-2 w-full">
                {LOGO_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setLogoMode(mode)}
                    className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                      logoMode === mode
                        ? "bg-primary-color text-white"
                        : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                    }`}
                  >
                    {LOGO_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            </RulerItem>
          )}
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Animation">
          <RulerItem label="Play">
            <div className="flex gap-2 w-full">
              {[true, false].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  onClick={() => setAnimate(on)}
                  className={`flex-1 py-1.5 rounded-sm text-xs uppercase transition-colors ${
                    animate === on
                      ? "bg-primary-color text-white"
                      : "bg-primary-lightgrey text-primary-darkgrey hover:opacity-80"
                  }`}
                >
                  {on ? "On" : "Off"}
                </button>
              ))}
            </div>
          </RulerItem>
          <RulerItem label="Loop">
            <Inputfield
              placeholder="4"
              unit="S"
              value={String(loopDuration)}
              onChange={(v) => setLoopDuration(Math.max(1, Number(v) || 0))}
            />
          </RulerItem>
          <div className="flex flex-col w-full items-center px-2 mt-2">
            <Button
              size="sm"
              text="Snapshot"
              color="grey"
              onClick={handleSnapshot}
              disabled={!animate}
            />
          </div>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Export">
          <RulerItem label="Name">
            <Inputfield
              placeholder="Filename"
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
          <Button
            size="sm"
            text={exporting ? "Exporting…" : format === "Video" ? "Export Video" : "Export"}
            onClick={handleExport}
            disabled={exporting}
          />
        </div>
        
      </div>
    </div>
  )
}

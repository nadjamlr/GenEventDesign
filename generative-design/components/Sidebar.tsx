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
import GalleryImageButton from "./GalleryImageButton"
import useDesignStore from "@/store/designStore"
import { shapes } from "@/lib/shapes"
import { GALLERY_IMAGES } from "@/lib/galleryImages"
import { DEFAULT_COLORS, normalizeHex } from "@/lib/colors"
import { exportRegistry } from "@/lib/canvasExport"
import { getInputFields } from "@/lib/inputFields"
import { ALL_ANCHORS, ANCHOR_LABELS, type LogoAnchor } from "@/lib/logoPlacement"
import { hasSides, type Side } from "@/lib/formats"
import type { LogoMode } from "@/algorithms/grid"
import { TEXT_STYLES, type TextStyleName } from "@/lib/textStyles"
import {
  type AreaKind,
  type AreaAnchor,
  type AreaDef,
  DEFAULT_IMAGE_AREA_SIZE,
  DEFAULT_TEXT_AREA_SIZE,
} from "@/lib/areas"

const EXPORT_TYPES = ["png", "pdf"] as const;
const SIDES: Side[] = ["front", "back"];
const AREA_KINDS: AreaKind[] = ["text", "image"];
const NO_IMAGE_AREA_FORMATS = ["Business Card", "Ticket", "Voucher"];
const NO_AREAS_FORMATS = ["Business Card", "Ticket", "Voucher"];
// Bei diesen Formaten werden alle Input-Felder (Vorder- und Rückseite)
// gemeinsam angezeigt, unabhängig vom Vorne/Hinten-Toggle.
const SHOW_ALL_SIDES_INPUT_FORMATS = ["Business Card", "Ticket", "Voucher"];
const LOGO_MODES: LogoMode[] = ["random", "logo", "icon"];
const LOGO_MODE_LABELS: Record<LogoMode, string> = { random: "Random", logo: "Logo", icon: "Icon" };
const ANCHOR_OPTIONS = ALL_ANCHORS.map((a) => ANCHOR_LABELS[a]);
const NO_SHAPE_LABEL = "No Shape";
const SHAPE_OPTIONS = [NO_SHAPE_LABEL, ...shapes.map((s) => s.label)];
const BACKGROUND_LABEL = "Background";
const TEXT_STYLE_OPTIONS = Object.keys(TEXT_STYLES) as TextStyleName[];

function labelToAnchor(label: string): AreaAnchor {
  if (label === BACKGROUND_LABEL) return "background";
  return ALL_ANCHORS.find((a) => ANCHOR_LABELS[a] === label) ?? "center";
}

function labelToShapeId(label: string): string | undefined {
  if (label === NO_SHAPE_LABEL) return undefined;
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
    inputValues,
    setInputValue,
    areas,
    addArea,
    removeArea,
    toggleAreaGrayscale,
    updateArea,
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
    gridResolution,
    dotSize,
    dotVariation,
    setGridResolution,
    setDotSize,
    setDotVariation,
  } = useDesignStore();

  const [hexInput, setHexInput] = useState("");
  const [exportName, setExportName] = useState("");
  const [exporting, setExporting] = useState(false);

  const [areaKind, setAreaKind] = useState<AreaKind>("text");
  const [areaAnchor, setAreaAnchor] = useState<AreaAnchor>("center");
  const [areaShapeId, setAreaShapeId] = useState<string | undefined>(undefined);
  const [areaText, setAreaText] = useState("");
  const [areaImageDataUrl, setAreaImageDataUrl] = useState<string | undefined>(undefined);
  const [areaGrayscale, setAreaGrayscale] = useState(false);
  const [areaTextStyle, setAreaTextStyle] = useState<TextStyleName>("title");
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
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

  function resetAreaForm() {
    setAreaText("");
    setAreaShapeId(undefined);
    setAreaImageDataUrl(undefined);
    setAreaGrayscale(false);
    setAreaTextStyle("title");
    setEditingAreaId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Eine laufende Bearbeitung gehört zur Seite, auf der sie gestartet wurde –
  // beim Umschalten Vorne/Hinten wird sie verworfen, statt die Area beim
  // Speichern unbeabsichtigt auf die andere Seite zu verschieben.
  useEffect(() => {
    resetAreaForm();
  }, [side]);

  // Lädt eine bereits platzierte Area zum Weiterbearbeiten in das Formular
  // oben (Position/Shape/Text/Bild/Textgröße). Beim Speichern (siehe
  // handleAddArea) wird ein evtl. per Drag&Drop gesetzter x/y-Versatz wieder
  // verworfen, damit der neu gewählte Anker tatsächlich greift.
  function startEditArea(area: AreaDef) {
    setEditingAreaId(area.id);
    setAreaKind(area.kind);
    setAreaAnchor(area.anchor);
    setAreaText(area.text ?? "");
    setAreaShapeId(area.shapeId);
    setAreaImageDataUrl(area.imageDataUrl);
    setAreaGrayscale(!!area.grayscale);
    setAreaTextStyle(area.style ?? "title");
  }

  function handleAddArea() {
    if (areaKind === "text") {
      if (!areaText.trim()) return;
      const payload = {
        kind: "text" as const,
        anchor: areaAnchor,
        text: areaText,
        style: areaTextStyle,
        side: formatHasSides ? side : undefined,
        ...DEFAULT_TEXT_AREA_SIZE,
      };
      if (editingAreaId) {
        updateArea(editingAreaId, { ...payload, x: undefined, y: undefined });
      } else {
        addArea(payload);
      }
    } else {
      if (!areaImageDataUrl) return;
      const payload =
        areaAnchor === "background"
          ? {
              // Hintergrund-Bild: keine Maske/Shape nötig, füllt den ganzen Rahmen.
              kind: "image" as const,
              anchor: "background" as const,
              imageDataUrl: areaImageDataUrl,
              grayscale: areaGrayscale,
              side: formatHasSides ? side : undefined,
              ...DEFAULT_IMAGE_AREA_SIZE,
            }
          : {
              kind: "image" as const,
              anchor: areaAnchor,
              shapeId: areaShapeId,
              imageDataUrl: areaImageDataUrl,
              grayscale: areaGrayscale,
              side: formatHasSides ? side : undefined,
              ...DEFAULT_IMAGE_AREA_SIZE,
            };
      if (editingAreaId) {
        updateArea(editingAreaId, { ...payload, x: undefined, y: undefined });
      } else {
        addArea(payload);
      }
    }
    resetAreaForm();
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
  const showAllSidesInput = SHOW_ALL_SIDES_INPUT_FORMATS.includes(format);
  // Felder mit defaultValue sind schon ohne Eingabe sichtbar (siehe grid.ts
  // resolveFieldText) – sie müssen also nicht zusätzlich in der Sidebar editierbar sein.
  const inputFields = getInputFields(format, formatHasSides && !showAllSidesInput ? side : undefined).filter(
    (field) => field.defaultValue === undefined
  );
  const showInputSection = inputFields.length > 0;
  // Areas gehören bei zweiseitigen Formaten zu genau einer Seite (siehe
  // AreaDef.side) – nur die zur gerade gewählten Seite anzeigen/bearbeiten.
  const visibleAreas = formatHasSides
    ? areas.filter((area) => (area.side ?? "front") === side)
    : areas;

  return (
    <div className="fixed top-0 right-0 h-screen w-78 bg-primary-black flex flex-col gap-6 px-5 py-8 overflow-y-auto">
      <img src="/logoShapes/Logo_NRLY_White.svg" alt="NRLY" className="h-8 w-auto" />
      <div className="flex flex-col gap-6">
        <RulerSection heading="Format">
          <RulerItem label="Format">
            <Dropdown
              label="Choose"
              value={format}
              fields={["Social Post", "Poster", "Flyer", "Video", "Business Card", "Ticket", "Voucher", "Sticker", "Skateboard", "T-Shirt"]}
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
          <div className="grid grid-cols-6 gap-2 px-2">
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
          <RulerItem label="Grid">
            <Slider range={10} defaultValue={gridResolution} onChange={setGridResolution} />
          </RulerItem>
          <RulerItem label="Dots">
            <Slider range={10} defaultValue={dotSize} onChange={setDotSize} />
          </RulerItem>
          <RulerItem label="Texture">
            <Slider range={10} defaultValue={dotVariation} onChange={setDotVariation} />
          </RulerItem>
        </RulerSection>

        {!NO_AREAS_FORMATS.includes(format) && (
          <>
            <SeparationLine/>

            <RulerSection heading="Areas">
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
              value={areaAnchor === "background" ? BACKGROUND_LABEL : ANCHOR_LABELS[areaAnchor]}
              fields={areaKind === "image" ? [...ANCHOR_OPTIONS, BACKGROUND_LABEL] : ANCHOR_OPTIONS}
              onChange={(label) => setAreaAnchor(labelToAnchor(label))}
            />
          </RulerItem>

          {areaKind === "text" ? (
            <>
              <RulerItem label="Text">
                <Inputfield placeholder="Text" value={areaText} onChange={setAreaText} />
              </RulerItem>
              <RulerItem label="Font Size">
                <Dropdown
                  label="Choose"
                  value={areaTextStyle}
                  fields={TEXT_STYLE_OPTIONS}
                  onChange={(v) => setAreaTextStyle(v as TextStyleName)}
                />
              </RulerItem>
            </>
          ) : (
            <>
              {areaAnchor !== "background" && (
                <RulerItem label="Shape">
                  <Dropdown
                    label="Choose"
                    value={shapes.find((s) => s.id === areaShapeId)?.label ?? NO_SHAPE_LABEL}
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
                  text={
                    areaImageDataUrl && !GALLERY_IMAGES.some((img) => img.src === areaImageDataUrl)
                      ? "Bild gewählt"
                      : "Upload"
                  }
                  color="grey"
                  onClick={() => fileInputRef.current?.click()}
                />
                <Button
                  text="B&W"
                  color={areaGrayscale ? "colored" : "grey"}
                  onClick={() => setAreaGrayscale((prev) => !prev)}
                />
              </RulerItem>
              <div className="grid grid-cols-4 gap-2 px-2">
                {GALLERY_IMAGES.map((img) => (
                  <GalleryImageButton
                    key={img.id}
                    label={img.label}
                    src={img.src}
                    selected={areaImageDataUrl === img.src}
                    onClick={() => setAreaImageDataUrl(img.src)}
                  />
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col w-full items-center gap-2 px-2 mt-2">
            <div className="flex gap-2 w-full justify-center">
              <Button size="sm" text={editingAreaId ? "Update Area" : "Add Area"} onClick={handleAddArea} />
              {editingAreaId && (
                <Button size="sm" text="Cancel" color="grey" onClick={resetAreaForm} />
              )}
            </div>
          </div>

          {visibleAreas.length > 0 && (
            <div className="flex flex-col gap-1 px-2 mt-2">
              {visibleAreas.map((area) => (
                <div
                  key={area.id}
                  onClick={() => startEditArea(area)}
                  className={`flex items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-xs text-primary-darkgrey cursor-pointer transition-colors ${
                    area.id === editingAreaId
                      ? "bg-primary-color/30 ring-1 ring-primary-color"
                      : "bg-primary-lightgrey hover:opacity-80"
                  }`}
                >
                  <span className="truncate">
                    {area.kind === "text" ? "Text" : "Bild"} ·{" "}
                    {area.anchor === "background" ? BACKGROUND_LABEL : ANCHOR_LABELS[area.anchor]}
                    {area.kind === "text" ? `: ${area.text}` : ""}
                  </span>
                  {area.kind === "image" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAreaGrayscale(area.id);
                      }}
                      className={`shrink-0 text-[10px] uppercase px-1.5 py-0.5 rounded-sm ${
                        area.grayscale
                          ? "bg-primary-color text-white"
                          : "bg-primary-darkgrey/20 text-primary-black hover:opacity-70"
                      }`}
                    >
                      B&W
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (editingAreaId === area.id) resetAreaForm();
                      removeArea(area.id);
                    }}
                    className="shrink-0 text-primary-black hover:opacity-60"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
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

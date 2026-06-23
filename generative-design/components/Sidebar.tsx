"use client";

import Button from "./Button"
import Slider from "./Slider"
import Dropdown from "./Dropdown"
import Inputfield from "./Inputfield"
import RulerItem from "./RulerItem"
import RulerSection from "./RulerSection"
import SeparationLine from "./SeperationLine"
import ShapeButton from "./ShapeButton"
import useDesignStore from "@/store/designStore"
import { shapes } from "@/lib/shapes"

export default function Sidebar() {
  const { setColumns, setRows, setFormat, selectedShapes, toggleShape } = useDesignStore();

  return (
    <div className="fixed top-0 right-0 h-screen w-72 bg-primary-black flex flex-col gap-6 px-5 py-8 overflow-y-auto">
      <img src="/logoShapes/Logo_NRLY_White.svg" alt="NRLY" className="h-8 w-auto" />
      <div className="flex flex-col gap-6">
        <RulerSection heading="Format">
          <RulerItem label="Size">
            <Inputfield placeholder="1000" unit="W"/>
            <Inputfield placeholder="1000" unit="H"/>
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
          <RulerItem label="Text">
            <Inputfield />
          </RulerItem>
          <RulerItem label="Media">
            <Button text="Upload" color="grey" />
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
        </RulerSection>

        <SeparationLine/>
        
        <RulerSection heading="Export">
          <RulerItem label="Name">
            <Inputfield placeholder="Name"/>
          </RulerItem>
        </RulerSection>
        
        <div className="flex flex-col w-full items-center">
          <Button size="sm" text="Export" />
        </div>
        
      </div>
    </div>
  )
}

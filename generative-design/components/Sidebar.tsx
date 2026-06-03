"use client";

import Button from "./Button"
import Slider from "./Slider"
import Dropdown from "./Dropdown"
import Inputfield from "./Inputfield"
import RulerItem from "./RulerItem"
import RulerSection from "./RulerSection"
import SeparationLine from "./SeperationLine"
import useDesignStore from "@/store/designstore"

export default function Sidebar() {
  const { setColumns, setRows, setFormat } = useDesignStore();

  return (
    <div className="fixed top-0 right-0 h-screen w-72 bg-primary-white flex flex-col gap-6 px-5 py-8 overflow-y-auto">
      <h1 className="text-primary-color">
        Brandify
      </h1>
      <div className="flex flex-col gap-6">
        <RulerSection heading="Format">
          <RulerItem label="Size">
            <Inputfield placeholder="1000" unit="W"/>
            <Inputfield placeholder="1000" unit="H"/>
          </RulerItem>
          <RulerItem label="Format">
            <Dropdown
              label="Choose"
              fields={["Flyer", "Instagram", "Video"]}
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

        <RulerSection heading="Shape" />

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

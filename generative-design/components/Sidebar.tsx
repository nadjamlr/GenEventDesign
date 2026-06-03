import Button from "./Button"
import Slider from "./Slider"
import Dropdown from "./Dropdown"
import Inputfield from "./Inputfield"
import RulerItem from "./RulerItem"
import RulerSection from "./RulerSection"
import SeparationLine from "./SeperationLine"

export default function Sidebar() {
  return (
    <div className="fixed top-0 right-0 h-screen w-72 bg-primary-white flex flex-col gap-6 px-5 py-5 overflow-y-auto">
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
            />
          </RulerItem>
          <RulerItem label="Columns">
            <Slider range={5}/>
          </RulerItem>
          <RulerItem label="Rows">
            <Slider range={4}/>
          </RulerItem>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Input">
          <RulerItem label="Text">
            <Inputfield />
          </RulerItem>
          <RulerItem label="Media">
            <Button text="Upload" />
          </RulerItem>
        </RulerSection>

        <SeparationLine/>

        <RulerSection heading="Shape" />

        <SeparationLine/>

        <RulerSection heading="Colors" />

        <SeparationLine/>
        
        <RulerSection heading="Export">
          <Button text="Export" />
        </RulerSection>
        
      </div>
    </div>
  )
}

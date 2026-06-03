type RulerSectionProps = {
    heading: string;
    children?: React.ReactNode;
};


export default function RulerSection({heading, children}: RulerSectionProps) {
    return(
        <div className="flex flex-col gap-2">
            <h2 className="flex flex-row text-primary-black">
                {heading}</h2>
            <div className="flex flex-col gap-1">
                {children}
            </div>

        </div>
    )
}
type RulerItemProps = {
    label: string;
    children: React.ReactNode;
};


export default function RulerItem({label, children}: RulerItemProps) {
    return(
        <div className="flex items-center gap-3 h-10 px-2 w-full">
            <h3 className="text-primary-darkgrey text-sm shrink-0 w-18">
                {label}
            </h3>
            <div className="flex flex-row gap-2 w-full">
                {children}
            </div>
        </div>
    )
}
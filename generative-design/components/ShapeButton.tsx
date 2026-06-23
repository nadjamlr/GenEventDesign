type ShapeButtonProps = {
  label: string;
  src: string;
  selected: boolean;
  onClick: () => void;
};

export default function ShapeButton({ label, src, selected, onClick }: ShapeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        aspect-square w-full flex items-center justify-center p-3 rounded-sm
        transition-colors
        ${selected ? "bg-primary-color" : "bg-primary-lightgrey hover:opacity-80"}
      `}
    >
      <img
        src={src}
        alt={label}
        className={`w-full h-full object-contain ${selected ? "invert" : ""}`}
      />
    </button>
  );
}

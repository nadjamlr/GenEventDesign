type ColorButtonProps = {
  hex: string;
  selected: boolean;
  onClick: () => void;
};

export default function ColorButton({ hex, selected, onClick }: ColorButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hex}
      style={{ backgroundColor: hex }}
      className={`
        aspect-square w-full rounded-sm border border-primary-lightgrey/30 transition-all
        ${selected ? "ring-2 ring-offset-2 ring-primary-color" : "hover:opacity-80"}
      `}
    />
  );
}

type GalleryImageButtonProps = {
  label: string;
  src: string;
  selected: boolean;
  onClick: () => void;
};

export default function GalleryImageButton({ label, src, selected, onClick }: GalleryImageButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`
        aspect-square w-full overflow-hidden rounded-sm transition-all
        ${selected ? "ring-2 ring-primary-color" : "opacity-80 hover:opacity-100"}
      `}
    >
      <img src={src} alt={label} className="w-full h-full object-cover" />
    </button>
  );
}

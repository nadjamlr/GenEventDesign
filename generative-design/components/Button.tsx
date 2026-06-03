type ButtonProps = {
  text: string;
  onClick?: () => void;
  color?: "colored" | "white" | "black";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
};

const sizeClasses = {
  sm: "px-3 py-1 text-xs",
  md: "px-5 py-2.5 text-base",
  lg: "px-7 py-3.5 text-lg",
};

const colorClasses = {
  colored: "bg-primary-color text-white hover:opacity-80",
  white: "bg-white text-black hover:opacity-80",
  black: "bg-black text-white hover:opacity-80",
};

export default function Button({
  text,
  onClick,
  color = "colored",
  size = "sm",
  disabled = false,
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        ${colorClasses[color]}
        font-semibold rounded-full transition-opacity
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      {text}
    </button>
  );
}

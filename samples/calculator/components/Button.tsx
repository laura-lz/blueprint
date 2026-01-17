import styles from "./Button.module.css";

interface ButtonProps {
    value: string;
    onClick: (value: string) => void;
    variant?: "number" | "operator" | "special" | "equals";
    wide?: boolean;
}

/**
 * Calculator button component
 * Supports multiple visual variants for different button types
 */
export default function Button({
    value,
    onClick,
    variant = "number",
    wide = false
}: ButtonProps) {
    const handleClick = () => {
        onClick(value);
    };

    const classNames = [
        styles.button,
        styles[variant],
        wide ? styles.wide : ""
    ].filter(Boolean).join(" ");

    return (
        <button
            className={classNames}
            onClick={handleClick}
            type="button"
        >
            {value}
        </button>
    );
}

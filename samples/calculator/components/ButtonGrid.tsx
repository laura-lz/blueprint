import Button from "./Button";
import styles from "./ButtonGrid.module.css";

interface ButtonGridProps {
    onButtonClick: (value: string) => void;
}

/**
 * Calculator button grid component
 * Arranges buttons in a 4x5 grid layout
 */
export default function ButtonGrid({ onButtonClick }: ButtonGridProps) {
    const buttons = [
        { value: "C", variant: "special" as const },
        { value: "±", variant: "special" as const },
        { value: "%", variant: "special" as const },
        { value: "÷", variant: "operator" as const },
        { value: "7", variant: "number" as const },
        { value: "8", variant: "number" as const },
        { value: "9", variant: "number" as const },
        { value: "×", variant: "operator" as const },
        { value: "4", variant: "number" as const },
        { value: "5", variant: "number" as const },
        { value: "6", variant: "number" as const },
        { value: "-", variant: "operator" as const },
        { value: "1", variant: "number" as const },
        { value: "2", variant: "number" as const },
        { value: "3", variant: "number" as const },
        { value: "+", variant: "operator" as const },
        { value: "0", variant: "number" as const, wide: true },
        { value: ".", variant: "number" as const },
        { value: "=", variant: "equals" as const },
    ];

    return (
        <div className={styles.grid}>
            {buttons.map((btn) => (
                <Button
                    key={btn.value}
                    value={btn.value}
                    onClick={onButtonClick}
                    variant={btn.variant}
                    wide={btn.wide}
                />
            ))}
        </div>
    );
}

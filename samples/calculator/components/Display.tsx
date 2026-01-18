import styles from "./Display.module.css";

interface DisplayProps {
    value: string;
    history: string;
}

/**
 * Calculator display component
 * Shows the current value and calculation history
 */
export default function Display({ value, history }: DisplayProps) {
    return (
        <div className={styles.display}>
            <div className={styles.history}>{history}</div>
            <div className={styles.value}>{value}</div>
        </div>
    );
}

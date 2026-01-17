"use client";

import { useState, useCallback } from "react";
import { calculate, parseInput, formatDisplay, Operation } from "@/lib/calculator";
import Display from "./Display";
import ButtonGrid from "./ButtonGrid";
import styles from "./Calculator.module.css";

/**
 * Main Calculator component
 * Manages state and orchestrates calculation logic
 */
export default function Calculator() {
    const [display, setDisplay] = useState("0");
    const [previousValue, setPreviousValue] = useState<number | null>(null);
    const [operation, setOperation] = useState<Operation | null>(null);
    const [waitingForOperand, setWaitingForOperand] = useState(false);
    const [history, setHistory] = useState("");

    /**
     * Handles number button clicks
     */
    const handleNumber = useCallback((num: string) => {
        if (waitingForOperand) {
            setDisplay(num);
            setWaitingForOperand(false);
        } else {
            setDisplay(display === "0" ? num : display + num);
        }
    }, [display, waitingForOperand]);

    /**
     * Handles decimal point input
     */
    const handleDecimal = useCallback(() => {
        if (waitingForOperand) {
            setDisplay("0.");
            setWaitingForOperand(false);
        } else if (!display.includes(".")) {
            setDisplay(display + ".");
        }
    }, [display, waitingForOperand]);

    /**
     * Handles operator button clicks
     */
    const handleOperator = useCallback((op: Operation) => {
        const currentValue = parseInput(display);

        if (previousValue !== null && operation && !waitingForOperand) {
            try {
                const result = calculate(previousValue, operation, currentValue);
                setDisplay(formatDisplay(result));
                setPreviousValue(result);
                setHistory(`${formatDisplay(result)} ${op}`);
            } catch (error) {
                setDisplay("Error");
                setPreviousValue(null);
                setHistory("");
                return;
            }
        } else {
            setPreviousValue(currentValue);
            setHistory(`${display} ${op}`);
        }

        setOperation(op);
        setWaitingForOperand(true);
    }, [display, previousValue, operation, waitingForOperand]);

    /**
     * Calculates and displays the result
     */
    const handleEquals = useCallback(() => {
        if (previousValue === null || operation === null) return;

        const currentValue = parseInput(display);

        try {
            const result = calculate(previousValue, operation, currentValue);
            setDisplay(formatDisplay(result));
            setHistory(`${formatDisplay(previousValue)} ${operation} ${display} =`);
            setPreviousValue(null);
            setOperation(null);
            setWaitingForOperand(true);
        } catch (error) {
            setDisplay("Error");
            setHistory("");
            setPreviousValue(null);
            setOperation(null);
        }
    }, [display, previousValue, operation]);

    /**
     * Clears all calculator state
     */
    const handleClear = useCallback(() => {
        setDisplay("0");
        setPreviousValue(null);
        setOperation(null);
        setWaitingForOperand(false);
        setHistory("");
    }, []);

    /**
     * Deletes the last digit
     */
    const handleBackspace = useCallback(() => {
        if (display.length === 1 || (display.length === 2 && display.startsWith("-"))) {
            setDisplay("0");
        } else {
            setDisplay(display.slice(0, -1));
        }
    }, [display]);

    /**
     * Toggles the sign of the current number
     */
    const handleToggleSign = useCallback(() => {
        const value = parseInput(display);
        setDisplay(formatDisplay(-value));
    }, [display]);

    /**
     * Calculates the percentage
     */
    const handlePercent = useCallback(() => {
        const value = parseInput(display);
        setDisplay(formatDisplay(value / 100));
    }, [display]);

    /**
     * Handles button clicks from the grid
     */
    const handleButtonClick = useCallback((value: string) => {
        switch (value) {
            case "C":
                handleClear();
                break;
            case "⌫":
                handleBackspace();
                break;
            case "±":
                handleToggleSign();
                break;
            case "%":
                handlePercent();
                break;
            case "+":
            case "-":
            case "×":
            case "÷":
                handleOperator(value as Operation);
                break;
            case "=":
                handleEquals();
                break;
            case ".":
                handleDecimal();
                break;
            default:
                handleNumber(value);
        }
    }, [handleClear, handleBackspace, handleToggleSign, handlePercent, handleOperator, handleEquals, handleDecimal, handleNumber]);

    return (
        <div className={styles.calculator}>
            <Display value={display} history={history} />
            <ButtonGrid onButtonClick={handleButtonClick} />
        </div>
    );
}

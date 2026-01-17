/**
 * Calculator logic module
 * Contains pure mathematical functions for calculator operations
 */

/**
 * Adds two numbers together
 * @param a - First operand
 * @param b - Second operand
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Subtracts the second number from the first
 * @param a - First operand
 * @param b - Second operand
 * @returns Difference of a and b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 * Multiplies two numbers together
 * @param a - First operand
 * @param b - Second operand
 * @returns Product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 * Divides the first number by the second
 * @param a - Dividend
 * @param b - Divisor
 * @returns Quotient of a divided by b
 * @throws Error if dividing by zero
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("Cannot divide by zero");
  }
  return a / b;
}

/**
 * Supported calculator operations
 */
export type Operation = "+" | "-" | "×" | "÷";

/**
 * Executes a mathematical operation on two operands
 * @param a - First operand
 * @param operation - The operation to perform
 * @param b - Second operand
 * @returns Result of the operation
 */
export function calculate(a: number, operation: Operation, b: number): number {
  switch (operation) {
    case "+":
      return add(a, b);
    case "-":
      return subtract(a, b);
    case "×":
      return multiply(a, b);
    case "÷":
      return divide(a, b);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

/**
 * Parses a string input to a number
 * @param input - String representation of a number
 * @returns Parsed number
 */
export function parseInput(input: string): number {
  const parsed = parseFloat(input);
  if (isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

/**
 * Formats a number for display
 * @param value - Number to format
 * @returns Formatted string representation
 */
export function formatDisplay(value: number): string {
  // Handle very large or very small numbers with scientific notation
  if (Math.abs(value) > 1e12 || (Math.abs(value) < 1e-10 && value !== 0)) {
    return value.toExponential(6);
  }
  
  // Format with appropriate decimal places
  const str = value.toString();
  if (str.length > 12) {
    return value.toPrecision(10);
  }
  
  return str;
}

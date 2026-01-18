import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm" | "lg" | "icon";
}

const buttonVariants = (variant: ButtonProps["variant"], size: ButtonProps["size"]) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "ring-offset-background disabled:pointer-events-none disabled:opacity-50",
    size === "sm" && "h-8 px-3",
    size === "lg" && "h-11 px-5 text-base",
    size === "icon" && "h-9 w-9",
    (!size || size === "default") && "h-10 px-4",
    variant === "secondary" &&
      "bg-muted text-foreground hover:bg-muted/80 border border-border",
    variant === "ghost" && "bg-transparent text-muted-foreground hover:text-foreground",
    variant === "outline" &&
      "bg-transparent border border-border text-foreground hover:bg-muted",
    (!variant || variant === "default") &&
      "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
  );

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants(variant, size), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };


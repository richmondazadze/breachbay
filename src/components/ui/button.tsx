import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
const variants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      outline: "button-outline",
      ghost: "button-ghost",
    },
    size: { default: "", sm: "button-small" },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof variants> {
  asChild?: boolean;
  pending?: boolean;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, pending = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={clsx(variants({ variant, size }), className)}
        ref={ref}
        {...props}
        data-pending={pending || undefined}
        aria-busy={pending || props["aria-busy"]}
        disabled={props.disabled || (pending && !asChild)}
        aria-disabled={pending || props["aria-disabled"]}
        onClick={event => { if(pending) {event.preventDefault();return;} onClick?.(event); }}
      />
    );
  },
);
Button.displayName = "Button";

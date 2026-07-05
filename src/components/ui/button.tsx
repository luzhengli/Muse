import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius-control) text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary) cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-(--color-primary) text-white hover:bg-(--color-primary-hover)",
        secondary:
          "bg-(--color-primary-soft) text-(--color-primary) hover:bg-violet-100",
        outline:
          "border border-(--color-border) bg-(--color-surface) hover:bg-(--color-muted-bg)",
        ghost: "hover:bg-(--color-muted-bg)",
        danger: "bg-(--color-danger) text-white hover:bg-red-700",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-7 px-2.5 text-xs",
        lg: "h-10 px-6",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };

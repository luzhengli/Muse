import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-1.5 whitespace-nowrap rounded-(--radius-control) text-sm font-medium transition-[color,background-color,border-color,opacity,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.97] motion-reduce:scale-100 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-primary) cursor-pointer",
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

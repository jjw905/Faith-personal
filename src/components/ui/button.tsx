import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** 모바일 터치 48 기본. 데스크톱만 밀도 축소 (Faith mobile-web-ui). */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-surface text-foreground hover:bg-surface-2",
        ghost: "text-muted hover:bg-surface hover:text-foreground",
        outline:
          "border border-border bg-card text-foreground hover:bg-surface",
        destructive: "bg-red-600 text-white hover:bg-red-700",
      },
      size: {
        default:
          "min-h-12 px-4 py-2 text-base md:h-10 md:min-h-10 md:text-sm",
        sm: "min-h-12 rounded-md px-3 text-base md:h-9 md:min-h-9 md:text-sm",
        lg: "min-h-12 rounded-lg px-6 text-base md:h-11 md:min-h-11",
        icon: "min-h-12 min-w-12 md:h-10 md:w-10 md:min-h-10 md:min-w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

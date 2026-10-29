import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded border text-xs sm:text-sm font-sans font-bold tracking-wide transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "border-amber-500/60 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30",
        tactical:
          "border-emerald-500/60 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30",
        danger:
          "border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/30",
        ghost:
          "border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800",
      },
      size: {
        default: "h-10 px-4 py-2 text-xs sm:text-sm",
        sm: "h-8 px-3 py-1.5 text-xs",
        lg: "h-12 px-6 py-2.5 text-sm sm:text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md border border-slate-800 bg-slate-950/90 text-slate-100 shadow-lg",
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs font-sans font-bold tracking-wide",
        className
      )}
      {...props}
    />
  );
}

const DISCRETE_WIDTH_CLASSES: ReadonlyArray<string> = [
  "w-0",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-full",
];

/**
 * Discretized Progress Bar using pure Tailwind classes (ZERO inline style attributes!).
 */
export function DiscretizedProgressBar({
  ratio,
  tone = "emerald",
  className,
}: {
  ratio: number;
  tone?: "emerald" | "amber" | "red" | "cyan";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const stepIndex = Math.round(clamped * 20);
  const widthClass = DISCRETE_WIDTH_CLASSES[stepIndex] ?? "w-0";

  const toneClass =
    tone === "red"
      ? "bg-red-500"
      : tone === "amber"
      ? "bg-amber-400"
      : tone === "cyan"
      ? "bg-cyan-400"
      : "bg-emerald-400";

  return (
    <div
      className={cn(
        "h-2.5 w-full overflow-hidden rounded bg-slate-900 border border-slate-800",
        className
      )}
    >
      <div className={cn("h-full transition-all duration-150", widthClass, toneClass)} />
    </div>
  );
}

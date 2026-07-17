import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl border text-sm font-medium transition focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'border-accent bg-accent px-4 py-2.5 text-white hover:bg-[#0353e9]',
        secondary: 'border-border-strong bg-white/5 px-4 py-2.5 text-foreground hover:bg-white/8',
        ghost: 'border-transparent bg-transparent px-3 py-2 text-muted-foreground hover:bg-white/5 hover:text-foreground',
      },
      size: {
        md: 'h-11',
        sm: 'h-9 px-3 text-xs',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id'>) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));

const toneIcon = {
  success: CheckCircle2,
  error: CircleAlert,
  info: Info,
  warning: AlertTriangle,
};

export function ToastViewport() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = toneIcon[toast.tone];

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="pointer-events-auto glass-panel rounded-2xl p-4"
            >
              <div className="flex items-start gap-3">
                <Icon className={cn('mt-0.5 h-5 w-5', toast.tone === 'error' ? 'text-danger' : toast.tone === 'warning' ? 'text-yellow-400' : 'text-accent-strong')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                  {toast.description ? <p className="mt-1 text-sm text-muted-foreground">{toast.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="rounded-full p-1 text-muted-foreground transition hover:bg-white/5 hover:text-foreground"
                  aria-label="Dismiss notification"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

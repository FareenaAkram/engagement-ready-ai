import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function statusTone(status: string) {
  switch (status) {
    case 'ready':
    case 'engagement-ready':
    case 'completed':
    case 'approved':
    case 'startup-ready':
    case 'current':
      return 'text-success';
    case 'ready-with-conditions':
    case 'watchlist':
    case 'in-progress':
    case 'monitoring':
    case 'acknowledged':
      return 'text-warning';
    case 'not-ready':
    case 'blocked':
    case 'open':
    case 'critical':
      return 'text-danger';
    default:
      return 'text-info';
  }
}

export function readinessLabel(status: string) {
  switch (status) {
    case 'ready': return 'Ready for Delivery';
    case 'ready-with-conditions': return 'Ready with Conditions';
    case 'not-ready': return 'Not Ready';
    default: return status.replace(/-/g, ' ');
  }
}

import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { create } from 'zustand';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type Toast = { id: number; message: string; icon?: IconName };

export type DialogRequest = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  destructive?: boolean;
  resolve(value: boolean): void;
};

type UiState = {
  toast: Toast | null;
  dialog: DialogRequest | null;
  showToast(message: string, icon?: IconName): void;
  hideToast(id: number): void;
  setDialog(dialog: DialogRequest | null): void;
};

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  toast: null,
  dialog: null,
  showToast(message, icon) {
    const id = ++toastId;
    set({ toast: { id, message, icon } });
    setTimeout(() => get().hideToast(id), 3200);
  },
  hideToast(id) {
    if (get().toast?.id === id) set({ toast: null });
  },
  setDialog(dialog) {
    set({ dialog });
  },
}));

export function toast(message: string, icon?: IconName) {
  useUi.getState().showToast(message, icon);
}

export function confirm(options: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  const current = useUi.getState().dialog;
  current?.resolve(false);
  return new Promise((resolve) => {
    useUi.getState().setDialog({ ...options, resolve });
  });
}

export function alertMessage(title: string, message?: string) {
  return confirm({ title, message, confirmLabel: 'OK', cancelLabel: null });
}

export function closeDialog() {
  const current = useUi.getState().dialog;
  if (current) {
    current.resolve(false);
    useUi.getState().setDialog(null);
  }
}

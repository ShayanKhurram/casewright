import * as ToastPrimitive from "@radix-ui/react-toast";
import { useCallback, useRef, useState, type ReactNode } from "react";

import Toast, { ToastContext, type ToastInput, type ToastRecord } from "./Toast";

/**
 * Mount ONCE, high in the tree (e.g. in `main.tsx` or `App.tsx`), wrapping the whole app:
 *
 *   import { ToastProvider } from "./components/ui";
 *   // …
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 * Then any descendant can call `const { toast } = useToast()` to enqueue a toast. This file is
 * intentionally left unwired here — editing `App.tsx`/`main.tsx` is out of scope for T5.2.
 */
export interface ToastProviderProps {
  children: ReactNode;
}

export default function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { ...input, id }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider>
        {children}
        {toasts.map((record) => (
          <Toast key={record.id} record={record} onDismiss={dismiss} />
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
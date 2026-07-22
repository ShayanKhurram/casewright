import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Radix-backed select. Trigger styled like <Input>; content is a `surface-2` elevated card.
 * `min-w-[var(--radix-select-trigger-width)]` is the standard Radix idiom for matching the
 * trigger width — it's a Radix CSS variable, not a hex arbitrary value. */
export default function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        className={[
          "inline-flex w-full items-center justify-between gap-2 rounded-control border border-border",
          "bg-surface px-3 py-2 text-sm text-text",
          "transition-colors duration-hover hover:border-border-strong",
          "focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-border-strong",
          "data-[placeholder]:text-text-faint",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className ?? "",
        ].join(" ")}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown size={16} className="text-text-faint" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={[
            "z-50 max-h-72 overflow-hidden rounded-card border border-border",
            "bg-surface-2 shadow-elevated",
            "min-w-[var(--radix-select-trigger-width)]",
          ].join(" ")}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={[
                  "relative flex cursor-pointer select-none items-center rounded-control py-1.5 pl-8 pr-2",
                  "text-sm text-text outline-none",
                  "data-[highlighted]:bg-surface data-[highlighted]:text-text",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                ].join(" ")}
              >
                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check size={14} className="text-text-dim" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
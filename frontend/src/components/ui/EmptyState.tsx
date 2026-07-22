import type { LucideIcon } from "lucide-react";

import Button from "./Button";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  /** A lucide icon component, e.g. `FileText`. Rendered large in `text-text-faint`. */
  icon: LucideIcon;
  title: string;
  description: string;
  action?: EmptyStateAction;
  className?: string;
}

/** Centered empty-state block, ~320px (`max-w-xs`) wide. Icon → title → description, and an
 * optional secondary <Button> action beneath. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[
        "mx-auto flex max-w-xs flex-col items-center text-center",
        className ?? "",
      ].join(" ")}
    >
      <Icon size={40} className="text-text-faint" />
      <p className="mt-3 text-sm font-medium text-text">{title}</p>
      <p className="mt-1 text-xs text-text-dim">{description}</p>
      {action ? (
        <Button variant="secondary" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
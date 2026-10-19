"use client";

import { Button, Modal, Spinner } from "@/components/ui";
import { cn } from "@/lib/format";

/**
 * Low-emphasis destructive button (red text, light red hover). A separate
 * component because overriding the shared ghost variant's text color via
 * className loses to its own `text-zinc-700` in the generated CSS.
 */
export function DangerTextButton({
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
}

/**
 * Confirmation modal for destructive or important actions. `children` can add
 * extra inputs (e.g. a note) between the description and the buttons.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
  confirmDisabled = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  // The shared Modal handles Escape, focus trapping and initial focus.
  const close = () => {
    if (!loading) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <div className="text-sm text-zinc-600">{description}</div>}
      {children && <div className={description ? "mt-4" : undefined}>{children}</div>}
    </Modal>
  );
}

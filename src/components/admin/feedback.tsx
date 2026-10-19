import { ApiError, errorMessage } from "@/lib/api";
import { Button, ButtonLink } from "@/components/ui";
import { cn } from "@/lib/format";
import { IconAlert } from "./icons";

/** Inline alert box (role="alert" for errors). */
export function InlineAlert({
  tone = "error",
  title,
  children,
  className,
}: {
  tone?: "error" | "warning" | "info";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-zinc-200 bg-zinc-50 text-zinc-700",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm", tones[tone], className)}
    >
      <IconAlert className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="break-words">{children}</div>}
      </div>
    </div>
  );
}

/** Full-width load failure with a retry button. 404s get a "not found" message. */
export function LoadError({
  error,
  onRetry,
  backHref,
  backLabel = "Go back",
  what = "this page",
}: {
  error: unknown;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
  what?: string;
}) {
  const notFound = error instanceof ApiError && error.status === 404;
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
      <IconAlert className="mb-3 size-6 text-zinc-400" />
      <h2 className="text-base font-semibold text-zinc-900">
        {notFound ? "Not found" : forbidden ? "Access denied" : `Couldn't load ${what}`}
      </h2>
      <p className="mt-1 max-w-sm text-sm text-zinc-600">
        {notFound ? `It may have been removed or the link is wrong.` : errorMessage(error)}
      </p>
      <div className="mt-5 flex gap-2">
        {onRetry && !notFound && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        {backHref && (
          <ButtonLink href={backHref} variant="ghost" size="sm">
            {backLabel}
          </ButtonLink>
        )}
      </div>
    </div>
  );
}

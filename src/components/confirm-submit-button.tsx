"use client";

/** Absende-Button mit Rückfrage – für Löschaktionen in Server-Formularen. */
export function ConfirmSubmitButton({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

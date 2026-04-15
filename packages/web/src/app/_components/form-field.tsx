"use client";

import { Textarea } from "@/components/ui/textarea";

interface FormFieldProps {
  id: string;
  label: string;
  optional?: boolean;
  value: string;
  onChange: (value: string) => void;
  onClearError: () => void;
  placeholder: string;
  rows: number;
  max: number;
  /** Character count at which the counter turns green. Defaults to 1 (any input). */
  minForGreen?: number;
  error?: string;
  errorId: string;
  disabled: boolean;
}

export function FormField({
  id,
  label,
  optional,
  value,
  onChange,
  onClearError,
  placeholder,
  rows,
  max,
  minForGreen = 1,
  error,
  errorId,
  disabled,
}: FormFieldProps) {
  const count = value.length;
  const counterClass =
    count > max
      ? "text-destructive"
      : count >= minForGreen
      ? "text-emerald-400"
      : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {optional && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
          )}
        </label>
        <span className={`text-sm tabular-nums ${counterClass}`}>
          {count.toLocaleString()} / {max.toLocaleString()}
        </span>
      </div>
      <Textarea
        id={id}
        name={id}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          if (error) onClearError();
        }}
        rows={rows}
        className="resize-y font-mono text-base leading-relaxed"
        aria-describedby={error ? errorId : undefined}
        aria-invalid={!!error}
        disabled={disabled}
      />
      {error && (
        <p id={errorId} className="text-base text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

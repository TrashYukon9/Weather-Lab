import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/* Linha de configuração: texto à esquerda, controle à direita. */
export function SettingRow({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string;
  hint?: string;
  children?: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`settings-row ${stacked ? "settings-row-stack" : ""}`}>
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>

        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>

      {children && <div className="settings-control">{children}</div>}
    </div>
  );
}

/* Escolha única entre poucas opções (radiogroup com setas do teclado). */
export function Segmented<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";

    if (!forward && !backward) return;

    event.preventDefault();

    const nextIndex =
      (index + (forward ? 1 : -1) + options.length) % options.length;

    onChange(options[nextIndex].value);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div aria-label={ariaLabel} className="settings-segmented" role="radiogroup">
      {options.map((option, index) => {
        const checked = option.value === value;

        return (
          <button
            aria-checked={checked}
            className="settings-segment"
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            role="radio"
            tabIndex={checked ? 0 : -1}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* Lista suspensa nativa (acessível por padrão). */
export function SelectField<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
}: {
  ariaLabel: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={ariaLabel}
      className="settings-select"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as T)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/* Interruptor ligado/desligado. */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="settings-switch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    />
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow hint={hint} label={label}>
      <Switch
        checked={checked}
        disabled={disabled}
        label={label}
        onChange={onChange}
      />
    </SettingRow>
  );
}

/* Mensagem de status (sucesso, erro, aviso ou informação). */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "success" | "warn" | "error";
  children: ReactNode;
}) {
  return (
    <p
      className={`settings-notice settings-notice-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

/* Diálogo de confirmação: foco preso, Esc cancela, foco volta ao fechar. */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;

    cancelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();

        return;
      }

      if (event.key !== "Tab") return;

      const first = cancelRef.current;
      const last = confirmRef.current;

      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, []);

  return (
    <div
      className="settings-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        aria-describedby={bodyId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="settings-dialog"
        role="alertdialog"
      >
        <h2 id={titleId}>{title}</h2>

        <div className="settings-dialog-body" id={bodyId}>
          {children}
        </div>

        <div className="settings-dialog-actions">
          <button
            className="settings-btn"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            {cancelLabel}
          </button>

          <button
            className="settings-btn settings-btn-danger"
            onClick={onConfirm}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
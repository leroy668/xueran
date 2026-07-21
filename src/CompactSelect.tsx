import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

type NativeOptionProps = {
  value?: string | number;
  disabled?: boolean;
  children?: ReactNode;
};

type CompactSelectOption = {
  value: string;
  label: string;
  disabled: boolean;
};

function getNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (!node) return "";
  if (Array.isArray(node)) return node.map(getNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return getNodeText(node.props.children);
  }
  return "";
}

function getOptions(children: ReactNode): CompactSelectOption[] {
  const options: CompactSelectOption[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement<NativeOptionProps>(child)) return;
    if (child.type !== "option") return;

    options.push({
      value: String(child.props.value ?? ""),
      label: getNodeText(child.props.children).replace(/\s+/g, " ").trim(),
      disabled: Boolean(child.props.disabled),
    });
  });

  return options;
}

function OptionCopy({ label }: { label: string }) {
  const [title, ...details] = label.split(" · ");

  return (
    <span className="compact-select-copy">
      <strong>{title}</strong>
      {details.length ? <small>{details.join(" · ")}</small> : null}
    </span>
  );
}

export function CompactSelect({
  value,
  children,
  disabled = false,
  ariaLabel,
  "aria-label": nativeAriaLabel,
  className = "",
  onChange,
  onValueChange,
}: {
  value: string;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  "aria-label"?: string;
  className?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const options = getOptions(children);
  const selected = options.find((option) => option.value === value);
  const accessibleLabel = ariaLabel ?? nativeAriaLabel ?? "选择选项";

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("touchstart", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("touchstart", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div
      className={["compact-select", className].filter(Boolean).join(" ")}
      ref={rootRef}
    >
      <button
        className={open ? "compact-select-trigger open" : "compact-select-trigger"}
        type="button"
        disabled={disabled}
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? <OptionCopy label={selected.label} /> : <span>请选择</span>}
        <ChevronDown size={15} />
      </button>

      {open ? (
        <div
          className={options.length > 6 ? "compact-select-options many" : "compact-select-options"}
          id={listId}
          role="listbox"
          aria-label={accessibleLabel}
        >
          {options.map((option) => {
            const active = option.value === value;

            return (
              <button
                className={active ? "compact-select-option active" : "compact-select-option"}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                key={option.value}
                onClick={() => {
                  onChange?.({ target: { value: option.value } });
                  onValueChange?.(option.value);
                  setOpen(false);
                }}
              >
                <OptionCopy label={option.label} />
                {active ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

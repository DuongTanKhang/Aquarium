import { useEffect, useId, useRef, useState } from "react";

export interface GlassSelectOption { value: string; label: string }

const GLASS_SELECT_OPEN_EVENT = "aquarium-glass-select-open";

export default function GlassSelect({ value, options, onChange, ariaLabel, className = "", disabled = false }: { value: string; options: GlassSelectOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectId = useId();
  const selected = options.find((option) => option.value === value);

  // Keep the menu state exclusive. This is especially important in table rows:
  // without a shared close signal, more than one absolutely-positioned menu can
  // remain open and the status options appear stacked on top of one another.
  useEffect(() => {
    const closeOtherSelects = (event: Event) => {
      const openedId = (event as CustomEvent<string>).detail;
      if (openedId !== selectId) setOpen(false);
    };
    document.addEventListener(GLASS_SELECT_OPEN_EVENT, closeOtherSelects);
    return () => document.removeEventListener(GLASS_SELECT_OPEN_EVENT, closeOtherSelects);
  }, [selectId]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const toggleOpen = () => {
    if (!open) document.dispatchEvent(new CustomEvent(GLASS_SELECT_OPEN_EVENT, { detail: selectId }));
    setOpen((current) => !current);
  };

  return <div className={`glass-select ${className} ${open ? "glass-select-open" : ""}`} ref={rootRef}>
    <button type="button" className="glass-select-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={toggleOpen}><span>{selected?.label ?? "Choose an option"}</span><span className="glass-select-chevron" aria-hidden="true" /></button>
    {open && <div className="glass-select-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`glass-select-option ${option.value === value ? "glass-select-option-active" : ""}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
  </div>;
}

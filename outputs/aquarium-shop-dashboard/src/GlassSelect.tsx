import { useEffect, useRef, useState } from "react";

export interface GlassSelectOption { value: string; label: string }

export default function GlassSelect({ value, options, onChange, ariaLabel, className = "", disabled = false }: { value: string; options: GlassSelectOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return <div className={`glass-select ${className} ${open ? "glass-select-open" : ""}`} ref={rootRef}>
    <button type="button" className="glass-select-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{selected?.label ?? "Choose an option"}</span><span className="glass-select-chevron" aria-hidden="true" /></button>
    {open && <div className="glass-select-menu" role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`glass-select-option ${option.value === value ? "glass-select-option-active" : ""}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>}
  </div>;
}

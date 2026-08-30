import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export interface GlassSelectOption { value: string; label: string }

const GLASS_SELECT_OPEN_EVENT = "aquarium-glass-select-open";

export default function GlassSelect({ value, options, onChange, ariaLabel, className = "", disabled = false }: { value: string; options: GlassSelectOption[]; onChange: (value: string) => void; ariaLabel: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectId = useId();
  const selected = options.find((option) => option.value === value);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

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
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  // Render the menu in the document layer instead of inside a table/card.
  // Fixed positioning means no ancestor overflow, transform, or table row
  // stacking context can clip the options list.
  useEffect(() => {
    if (!open) return undefined;
    const reposition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const isStatusSelect = className.split(/\s+/).includes("status-select");
      const width = isStatusSelect ? Math.max(rect.width, 142) : rect.width;
      const estimatedHeight = Math.min(230, options.length * 34 + 12);
      const gap = 6;
      let left = isStatusSelect ? rect.right - width : rect.left;
      let top = rect.bottom + gap;
      if (top + estimatedHeight > window.innerHeight - 8 && rect.top - estimatedHeight - gap >= 8) top = rect.top - estimatedHeight - gap;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setMenuStyle({ position: "fixed", top, left, right: "auto", width, maxHeight: 230, zIndex: 10000 });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [className, open, options.length]);
  const toggleOpen = () => {
    if (!open) document.dispatchEvent(new CustomEvent(GLASS_SELECT_OPEN_EVENT, { detail: selectId }));
    setOpen((current) => !current);
  };

  return <div className={`glass-select ${className} ${open ? "glass-select-open" : ""}`} ref={rootRef}>
    <button ref={triggerRef} type="button" className="glass-select-trigger" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={toggleOpen}><span>{selected?.label ?? "Choose an option"}</span><span className="glass-select-chevron" aria-hidden="true" /></button>
    {open && typeof document !== "undefined" && createPortal(<div ref={menuRef} className="glass-select-menu" style={menuStyle} role="listbox" aria-label={ariaLabel}>{options.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={`glass-select-option ${option.value === value ? "glass-select-option-active" : ""}`} key={option.value} onClick={() => { onChange(option.value); setOpen(false); }}>{option.label}</button>)}</div>, document.body)}
  </div>;
}

'use client';
import {
  Children,
  isValidElement,
  useId,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
  type ChangeEvent,
} from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown } from 'lucide-react';

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? textOf(child.props.children)
        : String(child),
    )
    .join('');
}
function optionsOf(children: ReactNode): { value: string; label: string; disabled: boolean }[] {
  return Children.toArray(children).flatMap((child) => {
    if (
      !isValidElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>(child)
    )
      return [];
    if (child.type !== 'option') return optionsOf(child.props.children);
    const label = textOf(child.props.children);
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
}

/** Native-compatible values, labels and form submission with an app-styled combobox. */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  name,
  required,
  disabled,
  className,
  id,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = optionsOf(children);
  const [internal, setInternal] = useState(String(defaultValue ?? options[0]?.value ?? ''));
  const selected = String(value ?? internal);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  const visible = options.filter((option) =>
    option.label.toLowerCase().includes(search.toLowerCase()),
  );
  function choose(next: string) {
    setInternal(next);
    onChange?.({
      target: { value: next, name },
      currentTarget: { value: next, name },
    } as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
  }
  function move(direction: number) {
    let next = active;
    for (let index = 0; index < visible.length; index++) {
      next = (next + direction + visible.length) % visible.length;
      if (!visible[next].disabled) break;
    }
    setActive(next);
    document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
  }
  return (
    <span className={`custom-select ${className ?? ''}`}>
      <select
        className="select-form-control"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        required={required}
        disabled={disabled}
        value={selected}
        onChange={(event) => choose(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current?.focus();
          setOpen(true);
        }}
      >
        {children}
      </select>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setSearch('');
          setActive(0);
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={trigger}
            id={id}
            type="button"
            role="combobox"
            aria-required={required}
            className="select-trigger"
            disabled={disabled}
            aria-label={props['aria-label']}
            aria-labelledby={props['aria-labelledby']}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setOpen(true);
              }
            }}
          >
            <span>{options.find((option) => option.value === selected)?.label ?? 'Select…'}</span>
            <ChevronDown size={16} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="select-popover"
            align="start"
            sideOffset={5}
            collisionPadding={12}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInput.current?.focus();
            }}
          >
            <input
              ref={searchInput}
              role="combobox"
              aria-label="Search options"
              aria-controls={listId}
              aria-expanded="true"
              aria-autocomplete="list"
              aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
              placeholder="Search…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setActive(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  move(event.key === 'ArrowDown' ? 1 : -1);
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (visible[active] && !visible[active].disabled) choose(visible[active].value);
                }
                if (event.key === 'Tab') {
                  event.preventDefault();
                  setOpen(false);
                  trigger.current?.focus();
                }
              }}
            />
            <div id={listId} role="listbox" aria-label="Options" className="select-options">
              {visible.map((option, index) => (
                <div
                  id={`${listId}-${index}`}
                  key={option.value}
                  role="option"
                  aria-selected={option.value === selected}
                  aria-disabled={option.disabled}
                  className={`select-option ${index === active ? 'focused' : ''}`}
                  onMouseMove={() => setActive(index)}
                  onClick={() => {
                    if (!option.disabled) choose(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {selected === option.value && <Check size={15} />}
                </div>
              ))}
              {!visible.length && <p className="empty">No matching options</p>}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}

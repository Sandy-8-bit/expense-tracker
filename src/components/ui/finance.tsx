'use client';
import { Select } from './select';
import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Decimal from 'decimal.js';
import { formatINR } from '../../lib/money';

export function MoneyText({ value, signed = false }: { value: Decimal.Value; signed?: boolean }) {
  const amount = new Decimal(value);
  return (
    <span
      className="money"
      style={signed ? { color: amount.lt(0) ? '#cf3447' : '#08805a' } : undefined}
    >
      {formatINR(amount)}
    </span>
  );
}
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`pill status-${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</span>
  );
}
export function formatDate(date: string) {
  return new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
export type DateRange = { from: string; to: string };
export function FilterPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="filter-panel">
      <button
        type="button"
        className="secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide filters' : 'Show filters'}{' '}
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
      </button>
      <div id={id} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
export function DateRangeFilter({
  value,
  onApply,
  children,
}: {
  value: DateRange;
  onApply: (range: DateRange) => void;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [quick, setQuick] = useState('');
  const months = Array.from({ length: 12 }, (_, index) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - index, 1, 12);
  });
  return (
    <FilterPanel>
      <form
        className="filter-bar date-range"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.from && draft.to && draft.from <= draft.to) onApply(draft);
        }}
      >
        <label>
          Quick period
          <Select
            value={quick}
            onChange={(event) => {
              setQuick(event.target.value);
              if (event.target.value) {
                const [year, month] = event.target.value.split('-').map(Number);
                const last = new Date(year, month, 0).getDate();
                setDraft({ from: `${event.target.value}-01`, to: `${event.target.value}-${last}` });
              }
            }}
          >
            <option value="">Custom dates</option>
            {months.map((month) => {
              const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
              return (
                <option key={key} value={key}>
                  {month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </option>
              );
            })}
          </Select>
        </label>
        <label>
          From
          <input
            type="date"
            required
            max={draft.to}
            value={draft.from}
            onChange={(e) => {
              setQuick('');
              setDraft({ ...draft, from: e.target.value });
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            required
            min={draft.from}
            value={draft.to}
            onChange={(e) => {
              setQuick('');
              setDraft({ ...draft, to: e.target.value });
            }}
          />
        </label>
        {children}
        <button type="submit">Apply filters</button>
      </form>
    </FilterPanel>
  );
}

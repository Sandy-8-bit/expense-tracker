import type { ReactNode } from 'react';

export function PageHeader({ children }: { children: ReactNode }) {
  return <div className="section-heading page-header">{children}</div>;
}

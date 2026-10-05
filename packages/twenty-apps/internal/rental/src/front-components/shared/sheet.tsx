import { type ReactNode } from 'react';

// A side sheet (drawer) that stays on screen while the page scrolls.
//
// position: fixed can't be used (Twenty's widgets sit in transformed boxes),
// so the page itself is the scroller: a screen-tall root with overflow auto
// and container-type: size. A sticky, zero-height box at the top of that root
// sticks while it scrolls, and 100cqw / 100cqh are exactly the visible area.
// Render <Sheet> as the FIRST child of the page's root.
export const Sheet = ({ width, onClose, children }: { width: number; onClose: () => void; children: ReactNode }) => (
  <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 1000 }}>
    <div onClick={onClose} style={{ position: 'absolute', top: 0, right: 0, width: '100cqw', height: '100cqh', background: 'rgba(0,0,0,0.25)' }} />
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: `min(${width}px, 100cqw)`,
        height: '100cqh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.16)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  </div>
);

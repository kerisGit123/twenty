import { type CSSProperties, type ReactNode, type SyntheticEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { RestApiClient } from 'twenty-client-sdk/rest';
import { defineFrontComponent } from 'twenty-sdk/define';
import { AppPath, enqueueSnackbar, navigate, openSidePanelPage, SidePanelPages } from 'twenty-sdk/front-component';

import { CONTRACTS_FRONT_COMPONENT_ID } from 'src/constants/universal-identifiers-v3';
import { OwnerSwitcher, useOwnerScope } from 'src/front-components/shared/owner-switcher';
import { Sheet } from 'src/front-components/shared/sheet';
import { todayIso } from 'src/logic-functions/utils/dates';
import {
  type ContractCard,
  type ContractsData,
  daysUntil,
  type Deduction,
  depositHeld,
  endingStage,
  isDepositSettled,
  parseDeductions,
  settleDeposit,
  termEnd,
} from 'src/shared/contracts';
import { rentForMonth } from 'src/shared/rent-month';
import { whatsappLink } from 'src/shared/whatsapp-link';

// Contracts: what's running, what ends soon (renew in two taps), and every
// deposit held — settled at move-out with deductions and a statement.

// ---------------------------------------------------------------- helpers

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const rm = (value: number) => `RM ${value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—');
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
};

const readValue = (event: SyntheticEvent<HTMLElement>): string => {
  const object = event as unknown as { detail?: { value?: string }; target?: { value?: string } };

  return object.detail?.value ?? object.target?.value ?? '';
};

const openContract = (id: string) => openSidePanelPage({ page: SidePanelPages.ViewRecord, recordId: id, objectNameSingular: 'rental' });

type Filter = 'active' | 'ending' | 'deposits' | 'ended' | 'all';

// ---------------------------------------------------------------- styles

const c = {
  font: 'var(--t-font-family)',
  text: 'var(--t-font-color-primary)',
  text2: 'var(--t-font-color-secondary)',
  text3: 'var(--t-font-color-tertiary)',
  bg: 'var(--t-background-primary)',
  bg2: 'var(--t-background-secondary)',
  border: 'var(--t-border-color-light)',
  border2: 'var(--t-border-color-medium)',
  accent: 'var(--t-color-blue9)',
  radius: 'var(--t-border-radius-md)',
};

const control: CSSProperties = {
  fontFamily: c.font,
  fontSize: 13,
  color: c.text,
  background: c.bg,
  border: `1px solid ${c.border2}`,
  borderRadius: c.radius,
  height: 34,
  padding: '0 10px',
  boxSizing: 'border-box',
  minWidth: 0,
};

const button = (primary = false): CSSProperties => ({
  ...control,
  cursor: 'pointer',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  ...(primary ? { background: c.accent, color: '#fff', border: `1px solid ${c.accent}` } : {}),
});

const chip = (active: boolean): CSSProperties => ({
  fontFamily: c.font,
  fontSize: 13,
  fontWeight: 500,
  height: 32,
  padding: '0 12px',
  borderRadius: 16,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  background: active ? 'var(--t-color-blue3)' : c.bg,
  color: active ? 'var(--t-color-blue11)' : c.text,
  border: `1px solid ${active ? 'var(--t-color-blue7)' : c.border2}`,
});

const pill = (color: string): CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '3px 9px',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  background: `var(--t-color-${color}3)`,
  color: `var(--t-color-${color}11)`,
});

const card: CSSProperties = { border: `1px solid ${c.border}`, borderRadius: 12, background: c.bg, minWidth: 0, boxSizing: 'border-box' };

const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 12, fontWeight: 600, color: c.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</span>
);

const SheetHeader = ({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) => (
  <div style={{ padding: '14px 16px', borderBottom: `1px solid ${c.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 650, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 13, color: c.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
    <button onClick={onClose} style={{ ...button(), width: 32, height: 32, padding: 0, border: 'none', fontSize: 18, background: 'transparent' }} aria-label="Close">
      ×
    </button>
  </div>
);

const post = <T,>(body: Record<string, unknown>) => new RestApiClient().post<T & { success: boolean; message?: string }>('/s/contracts', body);

// ---------------------------------------------------------------- page

const Contracts = () => {
  const today = todayIso();
  const scope = useOwnerScope();
  const [contracts, setContracts] = useState<ContractCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [renewing, setRenewing] = useState<ContractCard | null>(null);
  const [depositFor, setDepositFor] = useState<ContractCard | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await post<{ data?: ContractsData }>({ action: 'list' });

      if (!result.success || !result.data) throw new Error(result.message ?? 'Could not load contracts.');
      setContracts(result.data.contracts);
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not load contracts.', variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const mine = useMemo(() => contracts.filter((x) => scope.matches(x.ownerId)), [contracts, scope.key]);
  const active = mine.filter((x) => x.status === 'ACTIVE');
  const ending = active.filter((x) => endingStage(x, today) !== 'none');
  const withDeposit = mine.filter((x) => depositHeld(x.deposit) > 0);
  const heldTotal = withDeposit.reduce((sum, x) => sum + depositHeld(x.deposit), 0);
  const notStamped = active.filter((x) => !x.stampedOn);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base =
      filter === 'active'
        ? mine.filter((x) => x.status === 'ACTIVE')
        : filter === 'ending'
          ? mine.filter((x) => x.status === 'ACTIVE' && endingStage(x, today) !== 'none')
          : filter === 'deposits'
            ? mine.filter((x) => depositHeld(x.deposit) > 0 || x.deposit.status === 'PARTLY_REFUNDED' || x.deposit.status === 'REFUNDED' || x.deposit.status === 'FORFEITED')
            : filter === 'ended'
              ? mine.filter((x) => x.status === 'ENDED')
              : mine;

    return base
      .filter((x) => !term || `${x.propertyName} ${x.tenantName}`.toLowerCase().includes(term))
      .sort((a, b) => (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999'));
  }, [mine, filter, search, today]);

  const kpi = (label: string, value: string, hint: string, target: Filter, color: string) => (
    <button
      onClick={() => setFilter(filter === target ? 'active' : target)}
      style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', border: `1px solid ${filter === target ? c.accent : c.border}`, borderRadius: 12, padding: 'clamp(10px, 3cqw, 14px)', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, borderLeft: `3px solid var(--t-color-${color}9)` }}
    >
      <span style={{ fontSize: 12.5, color: c.text3 }}>{label}</span>
      <span style={{ fontSize: 'clamp(18px, 5.5cqw, 22px)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      <span style={{ fontSize: 12, color: c.text3 }}>{hint}</span>
    </button>
  );

  return (
    <div style={{ fontFamily: c.font, color: c.text, background: c.bg, height: '100%', overflowY: 'auto', containerType: 'size', boxSizing: 'border-box', position: 'relative' }}>
      {renewing && (
        <Sheet width={500} onClose={() => setRenewing(null)}>
          <RenewPanel
            key={renewing.id}
            contract={renewing}
            onClose={() => setRenewing(null)}
            onDone={async () => {
              setRenewing(null);
              await reload();
            }}
          />
        </Sheet>
      )}
      {depositFor && (
        <Sheet width={520} onClose={() => setDepositFor(null)}>
          <DepositPanel
            key={`${depositFor.id}|${depositFor.deposit.status}`}
            contract={depositFor}
            onClose={() => setDepositFor(null)}
            onDone={async () => {
              const result = await post<{ data?: ContractsData }>({ action: 'list' });

              if (result.success && result.data) {
                setContracts(result.data.contracts);
                setDepositFor(result.data.contracts.find((x) => x.id === depositFor.id) ?? null);
              }
            }}
          />
        </Sheet>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 'clamp(4px, 2vw, 16px)', maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 650 }}>Contracts</div>
            <div style={{ fontSize: 13, color: c.text3 }}>Who’s renting what, what ends soon, and every deposit you hold.</div>
          </div>
          <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'rentals' })} style={{ ...button(), height: 36 }}>
            ＋ New contract
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <OwnerSwitcher scope={scope} />
        </div>

        {/* Two per row on a phone, four on a wide screen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, calc(50% - 5px)), 1fr))', gap: 10 }}>
          {kpi('Active contracts', String(active.length), `${rm(active.reduce((s, x) => s + rentForMonth(x, today), 0))}/month in rent`, 'active', 'green')}
          {kpi('Ending soon', String(ending.length), 'within 120 days', 'ending', ending.length ? 'amber' : 'gray')}
          {kpi('Deposits held', rm(heldTotal), `${withDeposit.length} contract${withDeposit.length === 1 ? '' : 's'} · not your income`, 'deposits', 'sky')}
          {kpi('Not stamped', String(notStamped.length), 'active agreements', 'active', notStamped.length ? 'orange' : 'gray')}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'thin', paddingBottom: 2, maxWidth: '100%' }}>
            {(
              [
                ['active', 'Active', active.length],
                ['ending', 'Ending soon', ending.length],
                ['deposits', 'Deposits', withDeposit.length],
                ['ended', 'Ended', mine.filter((x) => x.status === 'ENDED').length],
                ['all', 'All', mine.length],
              ] as Array<[Filter, string, number]>
            ).map(([value, label, count]) => (
              <button key={value} onClick={() => setFilter(value)} style={chip(filter === value)}>
                {label}
                {count ? <span style={{ marginLeft: 6, opacity: 0.7 }}>{count}</span> : null}
              </button>
            ))}
          </div>
          <input placeholder="🔍  Property or tenant" value={search} onChange={(e) => setSearch(readValue(e))} style={{ ...control, flex: '1 1 180px' }} />
        </div>

        {loading && rows.length === 0 ? (
          <div style={{ color: c.text3, fontSize: 13, padding: 24, textAlign: 'center' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div style={{ ...card, color: c.text3, fontSize: 14, padding: '32px 16px', textAlign: 'center' }}>
            {filter === 'ending' ? 'Nothing ends in the next 120 days. 🎉' : filter === 'deposits' ? 'No deposits held.' : 'No contracts here.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rows.map((x) => (
              <ContractRow key={x.id} contract={x} today={today} all={contracts} onRenew={() => setRenewing(x)} onDeposit={() => setDepositFor(x)} />
            ))}
          </div>
        )}

        <button onClick={() => navigate(AppPath.RecordIndexPage, { objectNamePlural: 'rentals' })} style={{ ...button(), alignSelf: 'flex-start', border: 'none', fontSize: 12, color: c.text3, background: 'transparent' }}>
          Open as a table →
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- one contract

const ContractRow = ({
  contract: x,
  today,
  all,
  onRenew,
  onDeposit,
}: {
  contract: ContractCard;
  today: string;
  all: ContractCard[];
  onRenew: () => void;
  onDeposit: () => void;
}) => {
  const stage = endingStage(x, today);
  const days = x.endDate ? daysUntil(today, x.endDate) : null;
  const held = depositHeld(x.deposit);
  const progress =
    x.startDate && x.endDate
      ? Math.min(1, Math.max(0, daysUntil(x.startDate, today) / Math.max(1, daysUntil(x.startDate, x.endDate))))
      : null;
  const renewal = x.renewedById ? all.find((y) => y.id === x.renewedById) : null;
  const rentNow = rentForMonth(x, today);
  const change = x.newRent && x.newRentFrom && x.newRentFrom.slice(0, 7) > today.slice(0, 7) ? x : null;
  const statusPill =
    x.status === 'DRAFT' ? (
      <span style={pill('gray')}>Draft</span>
    ) : x.status === 'ENDED' ? (
      <span style={pill('gray')}>Ended</span>
    ) : renewal ? (
      <span style={pill('green')}>Renewed ✓</span>
    ) : stage === 'ended' ? (
      <span style={pill('red')}>Ended {-(days ?? 0)}d ago</span>
    ) : stage === 'urgent' ? (
      <span style={pill('red')}>Ends in {days} days</span>
    ) : stage === 'soon' ? (
      <span style={pill('amber')}>Ends in {days} days</span>
    ) : stage === 'later' ? (
      <span style={pill('blue')}>Ends in {days} days</span>
    ) : (
      <span style={pill('green')}>Active</span>
    );
  const depositText =
    x.deposit.status === 'CARRIED'
      ? 'Deposit carried to the renewal'
      : x.deposit.status === 'REFUNDED' || x.deposit.status === 'PARTLY_REFUNDED'
        ? `Deposit refunded ${rm(x.deposit.refunded)}${x.deposit.refundedOn ? ` · ${day(x.deposit.refundedOn)}` : ''}`
        : x.deposit.status === 'FORFEITED'
          ? 'Deposit used for deductions'
          : held > 0
            ? `Deposit held ${rm(held)}`
            : x.deposit.agreed
              ? `Deposit ${rm(x.deposit.agreed)} not received yet`
              : 'No deposit';
  const offer = whatsappLink(
    x.tenantPhone,
    `Hi ${x.tenantName.split(' ')[0] || 'there'}, your tenancy for ${x.propertyName} ends on ${day(x.endDate)}. Would you like to renew? Let me know and I'll prepare the new agreement.`,
  );

  return (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: c.bg2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
          {x.propertyType === 'SHOP' ? '🏪' : x.propertyType === 'LANDED' ? '🏡' : x.propertyType === 'ROOM' ? '🛏️' : '🏢'}
        </span>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.propertyName}</div>
          <div style={{ fontSize: 13, color: c.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {x.tenantName} · {rm(rentNow)}/month
          </div>
          {change && <div style={{ fontSize: 12, color: 'var(--t-color-iris11)', marginTop: 2 }}>↗ {rm(change.newRent ?? 0)} from {monthYear(change.newRentFrom ?? '')}</div>}
        </div>
        {statusPill}
      </div>

      {/* Signed agreement: open it, or upload it on the contract */}
      {x.agreement.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {x.agreement.map((file, index) => (
            <a
              key={`${file.url}-${index}`}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              title={file.label}
              style={{ ...button(), height: 30, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', maxWidth: '100%', overflow: 'hidden' }}
            >
              📄 <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.label}</span>
            </a>
          ))}
        </div>
      )}

      {/* Term */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: c.text2 }}>
          <span>{day(x.startDate)}</span>
          <span>{x.endDate ? day(x.endDate) : 'No end date'}</span>
        </div>
        {progress !== null && (
          <span style={{ height: 6, background: c.bg2, borderRadius: 3, display: 'block' }}>
            <span
              style={{
                display: 'block',
                height: 6,
                width: `${progress * 100}%`,
                borderRadius: 3,
                background: stage === 'urgent' || stage === 'ended' ? 'var(--t-color-red9)' : stage === 'soon' ? 'var(--t-color-amber9)' : 'var(--t-color-green9)',
              }}
            />
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 180px', fontSize: 12.5, color: c.text3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: held > 0 ? 'var(--t-color-sky11)' : c.text3 }}>🛡 {depositText}</span>
          {x.status === 'ACTIVE' && !x.stampedOn && <span style={{ color: 'var(--t-color-orange11)' }}>§ Not stamped</span>}
          {x.agreement.length === 0 && x.status !== 'ENDED' && <span style={{ color: 'var(--t-color-amber11)' }}>📄 No agreement uploaded</span>}
          {renewal && <span>→ renewed to {day(renewal.endDate)}</span>}
        </span>
        {x.status === 'ACTIVE' && !renewal && stage !== 'none' && offer && (
          <a href={offer} target="_blank" rel="noopener noreferrer" style={{ ...button(), display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: '#25D366', border: '1px solid #25D366', color: '#fff' }}>
            Ask to renew
          </a>
        )}
        <button onClick={() => openContract(x.id)} style={{ ...button(), color: c.text2 }} title={x.agreement.length ? 'Open the contract' : 'Open the contract to upload the signed agreement'}>
          {x.agreement.length || x.status === 'ENDED' ? 'Open' : '📎 Upload agreement'}
        </button>
        {(held > 0 || x.deposit.refunded > 0 || x.deposit.status === 'FORFEITED') && (
          <button onClick={onDeposit} style={button()}>
            Deposit
          </button>
        )}
        {x.status === 'ACTIVE' && !renewal && (
          <button onClick={onRenew} style={button(stage !== 'none')}>
            Renew
          </button>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- renew

const RenewPanel = ({ contract: x, onClose, onDone }: { contract: ContractCard; onClose: () => void; onDone: () => Promise<void> }) => {
  const today = todayIso();
  const firstStart = x.endDate ? addDays(x.endDate, 1) : today;
  const [start, setStart] = useState(firstStart);
  const [months, setMonths] = useState<number | null>(12);
  const [end, setEnd] = useState(termEnd(firstStart, 12));
  const [rent, setRent] = useState(String(rentForMonth(x, firstStart) || ''));
  const held = depositHeld(x.deposit);
  const [carry, setCarry] = useState(held > 0);
  const [busy, setBusy] = useState(false);
  const rentValue = Number(rent.replace(/[^\d.]/g, ''));
  const change = rentValue - rentForMonth(x, firstStart);

  const pickLength = (value: number) => {
    setMonths(value);
    setEnd(termEnd(start, value));
  };

  const renew = async () => {
    setBusy(true);
    try {
      const result = await post<{ id?: string }>({ action: 'renew', rentalId: x.id, startDate: start, endDate: end, rent: rentValue, carryDeposit: carry });

      await enqueueSnackbar({ message: result.message ?? (result.success ? 'Renewed.' : 'Could not renew.'), variant: result.success ? 'success' : 'error' });
      if (result.success) await onDone();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not renew.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <SheetHeader title="Renew contract" sub={`${x.propertyName} · ${x.tenantName}`} onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 13, color: c.text2, background: c.bg2, borderRadius: 10, padding: 12 }}>
          Current: {day(x.startDate)} – {day(x.endDate)} · {rm(rentForMonth(x, today))}/month
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Label>New term</Label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[6, 12, 24].map((value) => (
              <button key={value} onClick={() => pickLength(value)} style={chip(months === value)}>
                {value === 24 ? '2 years' : value === 12 ? '1 year' : '6 months'}
              </button>
            ))}
            <button onClick={() => setMonths(null)} style={chip(months === null)}>
              Custom
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: c.text2 }}>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                const v = readValue(e);

                if (!v) return;
                setStart(v);
                if (months) setEnd(termEnd(v, months));
              }}
              style={control}
            />
            to
            <input
              type="date"
              value={end}
              onChange={(e) => {
                const v = readValue(e);

                if (v) {
                  setEnd(v);
                  setMonths(null);
                }
              }}
              style={control}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label>Monthly rent</Label>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `2px solid ${c.accent}`, paddingBottom: 4 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: c.text3 }}>RM</span>
            <input
              value={rent}
              inputMode="decimal"
              onChange={(e) => setRent(readValue(e))}
              style={{ fontFamily: c.font, fontSize: 28, fontWeight: 700, color: c.text, border: 'none', outline: 'none', background: 'transparent', width: '100%', minWidth: 0, padding: 0 }}
            />
          </div>
          {rentValue > 0 && change !== 0 && (
            <span style={{ fontSize: 12.5, color: change > 0 ? 'var(--t-color-green11)' : 'var(--t-color-amber11)' }}>
              {change > 0 ? '↗' : '↘'} {rm(Math.abs(change))} ({((change / (rentValue - change)) * 100).toFixed(1)}%) vs now
            </span>
          )}
        </div>

        {held > 0 && (
          <button onClick={() => setCarry(!carry)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
            <span style={{ width: 40, height: 22, borderRadius: 11, background: carry ? c.accent : c.border2, position: 'relative', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, left: carry ? 20 : 2, width: 18, height: 18, borderRadius: 9, background: '#fff' }} />
            </span>
            Carry the deposit ({rm(held)}) over to the new contract
          </button>
        )}

        <div style={{ fontSize: 12.5, color: c.text3, lineHeight: 1.5 }}>
          Creates a new contract for the new term. This one stays as it is (with its payments) until it ends. The new agreement
          needs stamping within 30 days — it shows on Today.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}` }}>
        <button onClick={onClose} style={{ ...button(), flex: 1, height: 44 }}>
          Cancel
        </button>
        <button onClick={renew} disabled={busy || !(rentValue > 0) || end <= start} style={{ ...button(true), flex: 1.6, height: 44 }}>
          {busy ? 'Renewing…' : `Renew to ${day(end)}`}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- deposit

const QUICK_DEDUCTIONS = ['Cleaning', 'Repairs', 'Unpaid utilities', 'Unpaid rent', 'Key / access card', 'Repainting'];

const DepositPanel = ({ contract: x, onClose, onDone }: { contract: ContractCard; onClose: () => void; onDone: () => Promise<void> }) => {
  const d = x.deposit;
  const held = depositHeld(d);
  const settled = isDepositSettled(d);
  const [rows, setRows] = useState<Array<{ label: string; amount: string }>>([]);
  const [refundedOn, setRefundedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const deductions: Deduction[] = rows.map((r) => ({ label: r.label, amount: Number(r.amount.replace(/[^\d.]/g, '')) || 0 }));
  const result = settleDeposit(held, deductions);
  const recorded = parseDeductions(d.notes);
  const statementUrl = (lang: 'EN' | 'MS') => new RestApiClient().resolveUrl('/s/contracts/deposit-statement', { query: { rental: x.id, lang } });

  const line = (label: string, value: string, opts: { strong?: boolean; muted?: boolean } = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: opts.strong ? 15 : 13.5, fontWeight: opts.strong ? 700 : 400, color: opts.muted ? c.text3 : c.text }}>
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );

  const run = async (action: 'settleDeposit' | 'reopenDeposit') => {
    setBusy(true);
    try {
      const response = await post<Record<string, never>>({ action, rentalId: x.id, deductions, refundedOn });

      await enqueueSnackbar({ message: response.message ?? (response.success ? 'Saved.' : 'Could not save.'), variant: response.success ? 'success' : 'error' });
      if (response.success) await onDone();
    } catch (error) {
      await enqueueSnackbar({ message: error instanceof Error ? error.message : 'Could not save.', variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ height: '100%', background: c.bg, display: 'flex', flexDirection: 'column', fontFamily: c.font, color: c.text }}>
      <SheetHeader title="Deposit" sub={`${x.propertyName} · ${x.tenantName}`} onClose={onClose} />
      <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {d.carriedIn > 0 && line('Carried over from previous contract', rm(d.carriedIn))}
          {(d.received > 0 || d.carriedIn === 0) && line('Security deposit received', `${rm(d.received)}${d.agreed && d.received < d.agreed ? ` of ${rm(d.agreed)}` : ''}`)}
          {(d.utilityReceived > 0 || d.utilityAgreed > 0) && line('Utility deposit received', rm(d.utilityReceived))}
          {d.usedForRent > 0 && line(`Used for rent (${d.usedMonths.map(monthYear).join(', ')})`, `− ${rm(d.usedForRent)}`)}
          <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 8 }}>
            {line(settled ? 'Was held' : 'Held now', rm(settled ? d.carriedIn + d.received + d.utilityReceived - d.usedForRent : held), { strong: true })}
          </div>
          <span style={{ fontSize: 12, color: c.text3 }}>A deposit is the tenant’s money, not income — it’s left out of your rent totals.</span>
        </div>

        {settled ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Label>{d.status === 'CARRIED' ? 'Carried to the renewal' : 'Settled at move-out'}</Label>
            {d.status !== 'CARRIED' && (
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recorded.length === 0 && line('Deductions', 'none', { muted: true })}
                {recorded.map((r, i) => (
                  <div key={i}>{line(r.label, `− ${rm(r.amount)}`)}</div>
                ))}
                <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 8 }}>{line('Refunded', rm(d.refunded), { strong: true })}</div>
                {d.refundedOn && line('On', day(d.refundedOn), { muted: true })}
              </div>
            )}
            {d.status === 'CARRIED' && <div style={{ fontSize: 13, color: c.text2 }}>{d.notes}</div>}
            {d.status !== 'CARRIED' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a href={statementUrl('EN')} target="_blank" rel="noreferrer" style={{ ...button(true), height: 40, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', flex: 1, justifyContent: 'center' }}>
                  📤 Deposit statement
                </a>
                <a href={statementUrl('MS')} target="_blank" rel="noreferrer" style={{ ...button(), height: 40, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                  Bahasa Melayu
                </a>
              </div>
            )}
            {d.status !== 'CARRIED' && (
              <button onClick={() => run('reopenDeposit')} disabled={busy} style={{ all: 'unset', cursor: 'pointer', fontSize: 13, color: c.text3, textDecoration: 'underline', alignSelf: 'flex-start' }}>
                Undo — mark the deposit as held again
              </button>
            )}
          </div>
        ) : held > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Label>Move-out: deductions</Label>
            {rows.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  value={r.label}
                  onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, label: readValue(e) } : row)))}
                  placeholder="What for"
                  style={{ ...control, flex: 1 }}
                />
                <input
                  value={r.amount}
                  inputMode="decimal"
                  onChange={(e) => setRows(rows.map((row, j) => (j === i ? { ...row, amount: readValue(e) } : row)))}
                  placeholder="RM"
                  style={{ ...control, width: 90 }}
                />
                <button onClick={() => setRows(rows.filter((_, j) => j !== i))} style={{ ...button(), width: 34, padding: 0 }} aria-label="Remove">
                  ×
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {QUICK_DEDUCTIONS.map((label) => (
                <button key={label} onClick={() => setRows([...rows, { label, amount: '' }])} style={{ ...chip(false), height: 28, fontSize: 12 }}>
                  ＋ {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.text2, flexWrap: 'wrap' }}>
              Refunded on
              <input type="date" value={refundedOn} onChange={(e) => { const v = readValue(e); if (v) setRefundedOn(v); }} style={control} />
            </div>
            <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, background: c.bg2 }}>
              {line('Held', rm(held))}
              {result.deducted > 0 && line('Deductions', `− ${rm(result.deducted)}`)}
              {line(result.refund > 0 ? 'Refund to tenant' : 'Nothing to refund', rm(result.refund), { strong: true })}
            </div>
            <span style={{ fontSize: 12, color: c.text3 }}>Keep the bills or photos for each deduction — the tenant can ask for them.</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: c.text3 }}>No deposit is held. Record the deposit as a payment (type Security deposit) to track it here.</div>
        )}
      </div>
      {!settled && held > 0 && (
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${c.border}` }}>
          <button onClick={onClose} style={{ ...button(), flex: 1, height: 44 }}>
            Cancel
          </button>
          <button onClick={() => run('settleDeposit')} disabled={busy} style={{ ...button(true), flex: 1.6, height: 44 }}>
            {busy ? 'Saving…' : result.refund > 0 ? `Settle · refund ${rm(result.refund)}` : 'Settle · keep the deposit'}
          </button>
        </div>
      )}
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: CONTRACTS_FRONT_COMPONENT_ID,
  name: 'contracts',
  description: 'Contracts: ending soon and renewals, and the deposit register with move-out settlement',
  component: Contracts,
});

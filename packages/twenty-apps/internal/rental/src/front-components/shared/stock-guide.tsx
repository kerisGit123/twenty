import { c, control, primary } from 'src/front-components/shared/stock-ui';
import type { StockMovement } from 'src/shared/stock';
import { L } from 'src/front-components/shared/stock-i18n';

// Getting started with Stock: the three jobs everything else builds on, in order.
// Each step ticks itself off from the real data (a product exists, a delivery was
// recorded, stock was taken out) and its button opens the right form directly.

type Step = { title: string; how: string; done: boolean; action: { label: string; onClick: () => void } | null; extra?: { label: string; onClick: () => void } | null; blocked?: string };

export const StockGuide = ({
  itemCount,
  movements,
  canAddItems,
  onAddItem,
  onImport,
  onStockIn,
  onTakeOut,
  onHide,
}: {
  itemCount: number;
  movements: StockMovement[];
  canAddItems: boolean; // managers add products; staff ask them
  onAddItem: () => void;
  onImport: () => void;
  onStockIn: () => void;
  onTakeOut: () => void;
  onHide: (() => void) | null; // null: the guide cannot be hidden yet (nothing to show instead)
}) => {
  const hasItems = itemCount > 0;
  const steps: Step[] = [
    {
      title: L('Add your products', 'Tambah produk anda'),
      how: canAddItems
        ? L(
            'Once per product: its name, how it is packed (e.g. 8 bags in a carton) and the price of a carton. Have your monthly stock Excel? Import it to add everything at once. Already have stock on the shelf? Use Manage products, then “Enter what is on the shelf now”, to type how many you have, for many items at once.',
            'Sekali sahaja bagi setiap produk: namanya, cara ia dibungkus (cth. 8 beg dalam sekarton) dan harga sekarton. Ada Excel stok bulanan? Import untuk tambah semua sekali gus. Sudah ada stok di rak? Guna Urus produk, kemudian “Masukkan stok di rak sekarang”, untuk taip berapa banyak, bagi banyak produk sekali gus.',
          )
        : L('Your manager adds the products first (name, how it is packed, price). Ask them, then come back here.', 'Pengurus anda menambah produk dahulu (nama, cara bungkus, harga). Minta mereka, kemudian kembali ke sini.'),
      done: hasItems,
      action: canAddItems ? { label: L('+ Add a product', '+ Tambah produk'), onClick: onAddItem } : null,
      extra: canAddItems ? { label: L('⬆ Add many from Excel', '⬆ Tambah banyak dari Excel'), onClick: onImport } : null,
    },
    {
      title: L('A delivery came: Stock in', 'Barang sampai: Stok masuk'),
      how: L(
        'Tap Stock in, type the supplier (and invoice no.), tap +1 carton for each carton or type the number, then Save. The cost is added to Expenses by itself.',
        'Tekan Stok masuk, taip pembekal (dan no. invois), tekan +1 karton bagi setiap karton atau taip nombornya, kemudian Simpan. Kos masuk ke Perbelanjaan secara automatik.',
      ),
      done: movements.some((m) => m.type === 'PURCHASE' || m.type === 'BORROW_IN'),
      action: { label: L('↓ Stock in', '↓ Stok masuk'), onClick: onStockIn },
      blocked: hasItems ? undefined : L('Add a product first.', 'Tambah produk dahulu.'),
    },
    {
      title: L('Stock goes to the shop: Take out', 'Stok ke kedai: Keluarkan'),
      how: L(
        'Tap Take out, type which shop it goes to, add the cartons, then Save. Take-outs are how the app learns your monthly usage and tells you what to order.',
        'Tekan Keluarkan, taip kedai mana ia dihantar, tambah karton, kemudian Simpan. Rekod keluaran membolehkan sistem belajar penggunaan bulanan anda dan memberitahu apa yang perlu dipesan.',
      ),
      done: movements.some((m) => m.type === 'TAKE'),
      action: { label: L('↑ Take out', '↑ Keluarkan'), onClick: onTakeOut },
      blocked: hasItems ? undefined : L('Add a product first.', 'Tambah produk dahulu.'),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);

  return (
    <div style={{ border: `1px solid var(--t-color-blue6)`, background: 'var(--t-color-blue2)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{doneCount === steps.length ? L('You are set up', 'Anda sudah bersedia') : L('Getting started with Stock', 'Mula menggunakan Stok')}</span>
          <span style={{ fontSize: 13, color: c.text2 }}>
            {doneCount === steps.length
              ? L('All three basics done. Waste, Count and Borrow / lend work the same way.', 'Ketiga-tiga asas selesai. Rosak, Kira stok dan Pinjam / beri pinjam berfungsi dengan cara yang sama.')
              : L(`${doneCount} of ${steps.length} done. Do these once and you know the whole system.`, `${doneCount} daripada ${steps.length} selesai. Buat ini sekali dan anda tahu keseluruhan sistem.`)}
          </span>
        </div>
        {onHide ? (
          <button onClick={onHide} style={{ ...control, height: 30, fontSize: 13, color: c.text2 }}>
            {L('Hide guide', 'Sembunyi panduan')}
          </button>
        ) : null}
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--t-color-blue4)', overflow: 'hidden' }}>
        <div style={{ width: `${(doneCount / steps.length) * 100}%`, height: '100%', background: c.accent, transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        {steps.map((s, i) => {
          const current = i === next;

          return (
            <div
              key={s.title}
              style={{ background: c.bg, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, border: `${current ? 2 : 1}px solid ${current ? c.accent : c.border}`, opacity: s.done && !current ? 0.75 : 1 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    background: s.done ? 'var(--t-color-green9)' : current ? c.accent : 'var(--t-color-gray4)',
                    color: s.done || current ? 'white' : c.text2,
                  }}
                >
                  {s.done ? '✓' : i + 1}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</span>
              </div>
              <span style={{ fontSize: 13, color: c.text2, lineHeight: 1.45 }}>{s.how}</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', alignItems: 'center' }}>
                {s.blocked ? (
                  <span style={{ fontSize: 12, color: c.text3 }}>{s.blocked}</span>
                ) : (
                  <>
                    {s.action ? (
                      <button onClick={s.action.onClick} style={current ? primary : control}>
                        {s.done ? L(`${s.action.label} again`, `${s.action.label} lagi`) : s.action.label}
                      </button>
                    ) : null}
                    {s.extra ? (
                      <button onClick={s.extra.onClick} style={control}>
                        {s.extra.label}
                      </button>
                    ) : null}
                    {s.done ? <span style={{ fontSize: 12, color: 'var(--t-color-green11)', fontWeight: 600 }}>{L('Done', 'Siap')}</span> : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

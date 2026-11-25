// Language for the Stock page: English or Bahasa Malaysia. The choice is remembered in this browser.
//
//   tr('Take out')            a fixed phrase: looked up in the table below, English stays as written
//   L('1 carton', '1 karton') a sentence with numbers in it: both versions are written where it is used
//
// A phrase with no Malay entry simply stays in English, so a missing word never breaks a screen.

export type Lang = 'en' | 'ms';

const KEY = 'stock.lang';

const read = (): Lang => {
  try {
    return globalThis.localStorage?.getItem(KEY) === 'ms' ? 'ms' : 'en';
  } catch {
    return 'en';
  }
};

let current: Lang = read();

export const getLang = (): Lang => current;

export const setLang = (lang: Lang) => {
  current = lang;
  try {
    globalThis.localStorage?.setItem(KEY, lang);
  } catch {
    // per-person convenience only
  }
};

export const L = (en: string, ms: string) => (current === 'ms' ? ms : en);

const MS: Record<string, string> = {
  // Page
  'Stock': 'Stok',
  "What's in hand, every IN and OUT, and what to order next.": 'Stok semasa, semua masuk dan keluar, dan apa yang perlu dipesan seterusnya.',
  'Updating…': 'Mengemas kini…',
  '? How to use': '? Cara guna',
  'Manager view': 'Paparan pengurus',
  'Everyday view': 'Paparan harian',
  'Manage products ▾': 'Urus produk ▾',
  '＋ Add a new product': '＋ Tambah produk baru',
  'A product you have not listed yet': 'Produk yang belum disenaraikan',
  '📦 Enter what is on the shelf now': '📦 Masukkan stok di rak sekarang',
  'Starting stock for many products, on a date': 'Stok permulaan untuk banyak produk, pada satu tarikh',
  '⬆ Add many products from Excel': '⬆ Tambah banyak produk dari Excel',
  'Your monthly stock sheet (订货单)': 'Lembaran stok bulanan anda (订货单)',
  'To remove a product you no longer use: click it in the list, then “Stop using this product”.': 'Untuk buang produk yang tidak digunakan lagi: klik produk itu dalam senarai, kemudian “Berhenti guna produk ini”.',
  '⚠ Start stock again…': '⚠ Mula semula stok…',
  'Deletes all stock records of this business. Asks you to confirm.': 'Memadam semua rekod stok perniagaan ini. Anda akan diminta mengesahkan.',
  'Loading your stock… the first load can take a few seconds.': 'Memuatkan stok anda… muatan pertama mungkin ambil beberapa saat.',

  // Big buttons and tabs
  'Take out': 'Keluarkan',
  'stock goes to the shop': 'stok dihantar ke kedai',
  'Stock in': 'Stok masuk',
  'a delivery came': 'barang sampai',
  'Waste': 'Rosak / buang',
  'thrown away or spoiled': 'dibuang atau rosak',
  'Count': 'Kira stok',
  'check the shelf · finds missing stock': 'semak rak · cari stok hilang',
  'Borrow / lend': 'Pinjam / beri pinjam',
  'with another shop': 'dengan kedai lain',
  'History': 'Sejarah',
  'Ordering': 'Pesanan',
  'Loans': 'Pinjaman',
  'Month end': 'Akhir bulan',
  'What to order': 'Apa perlu dipesan',
  'Orders': 'Pesanan',
  'Branch requests': 'Permintaan cawangan',
  'Monthly stock sheet': 'Lembaran stok bulanan',
  'Close the month': 'Tutup bulan',
  'Usage vs sales': 'Penggunaan vs jualan',

  // Quick entry
  'Quick entry': 'Catat stok',
  'Waste / missing': 'Rosak / hilang',
  'Borrow in': 'Pinjam masuk',
  'Lend out': 'Beri pinjam',
  'Starting stock': 'Stok permulaan',
  'Taken to (which shop / outlet)': 'Dihantar ke (kedai / outlet mana)',
  'Reason (expired, spilled, missing…)': 'Sebab (tamat tempoh, tumpah, hilang…)',
  'Supplier': 'Pembekal',
  'Which shop lent it to you?': 'Kedai mana meminjamkannya kepada anda?',
  'Which shop borrowed it?': 'Kedai mana meminjamnya?',
  'Save take out': 'Simpan keluaran',
  'Save waste': 'Simpan rosak',
  'Add to stock': 'Tambah ke stok',
  'Save borrow': 'Simpan pinjaman',
  'Save lend': 'Simpan beri pinjam',
  'Save starting stock': 'Simpan stok permulaan',
  'Stock leaves the store room for the shop. The stock goes down.': 'Stok keluar dari stor ke kedai. Stok berkurang.',
  'Thrown away or spoiled. The stock goes down. Not sure where it went? Close this and use Count.': 'Dibuang atau rosak. Stok berkurang. Tidak pasti ke mana perginya? Tutup ini dan guna Kira stok.',
  'A delivery came. The stock goes up and the cost is added to Expenses.': 'Barang sampai. Stok bertambah dan kos dimasukkan ke Perbelanjaan.',
  'You got stock from another shop. The stock goes up and you owe it back.': 'Anda dapat stok daripada kedai lain. Stok bertambah dan anda perlu pulangkan.',
  'You gave stock to another shop. The stock goes down and they owe it back.': 'Anda beri stok kepada kedai lain. Stok berkurang dan mereka perlu pulangkan.',
  'How many to take out:': 'Berapa nak dikeluarkan:',
  'How many wasted:': 'Berapa yang rosak:',
  'How many to lend:': 'Berapa nak dipinjamkan:',
  'How many borrowed:': 'Berapa dipinjam:',
  'How many arrived:': 'Berapa yang sampai:',
  'How many on the shelf:': 'Berapa di rak:',
  'Step 1: tap a product below (+1 carton or +1 each). Step 2: check or type the number on the product. Step 3: press Save.': 'Langkah 1: tekan produk di bawah (+1 karton atau +1 biji). Langkah 2: semak atau taip nombor pada produk. Langkah 3: tekan Simpan.',
  '🔍 Type a code or name…': '🔍 Taip kod atau nama…',
  '★ Usual': '★ Biasa',
  '+1 carton': '+1 karton',
  'Cancel': 'Batal',
  'Invoice / DO no. (optional)': 'No. invois / DO (pilihan)',
  'Pick a full date.': 'Pilih tarikh penuh.',
  'Pick why it was wasted (the buttons near the top), then Save.': 'Pilih sebab rosak (butang di atas), kemudian Simpan.',
  'Say which shop: tap one near the top or type its name.': 'Nyatakan kedai mana: tekan satu di atas atau taip namanya.',

  // Count
  'Count the shelf': 'Kira stok di rak',
  'How to count:': 'Cara mengira:',
  '1. Stand at the shelf and count what is really there.': '1. Berdiri di rak dan kira apa yang benar-benar ada.',
  '2. Type that number next to each product. Leave a product empty if you did not count it: it will not be changed.': '2. Taip nombor itu di sebelah setiap produk. Biarkan kosong jika tidak dikira: ia tidak akan diubah.',
  '3. Check the red and green numbers, then press Save. The stock is corrected to what you counted, and any missing stock is recorded.': '3. Semak nombor merah dan hijau, kemudian tekan Simpan. Stok dibetulkan mengikut kiraan anda, dan stok yang hilang direkodkan.',
  'The system hides its own number until you type yours, so the count stays honest.': 'Sistem menyembunyikan nombornya sehingga anda taip nombor anda, supaya kiraan jujur.',
  'Counted on': 'Dikira pada',
  '⬇ Count sheet (Excel)': '⬇ Lembaran kira (Excel)',
  'Filled in already? Load it here': 'Sudah diisi? Muat naik di sini',
  'Counted': 'Telah dikira',
  'Total difference': 'Jumlah beza',
  'Search code or name': 'Cari kod atau nama',
  '✓ right': '✓ betul',
  'Pick the date you counted.': 'Pilih tarikh anda mengira.',
  'Type how many you counted for at least one product, then Save.': 'Taip bilangan yang dikira untuk sekurang-kurangnya satu produk, kemudian Simpan.',

  // History
  'Nothing came in or went out in this period.': 'Tiada masuk atau keluar dalam tempoh ini.',
  'Show this year': 'Tunjuk tahun ini',
  'Show all time': 'Tunjuk semua masa',

  // Month end
  'Months · close a month': 'Bulan · tutup bulan',
  'Each product · Jan–Dec': 'Setiap produk · Jan–Dis',
  '1. Count the shelf': '1. Kira stok di rak',
  '✓ Counted this month': '✓ Sudah dikira bulan ini',
  'Not counted yet. Counting makes the closing match the shelf.': 'Belum dikira. Mengira menjadikan stok penutup sama dengan rak.',
  'Count now': 'Kira sekarang',
  '2. Look at what was lost': '2. Lihat apa yang hilang',
  'Nothing wasted or missing was recorded.': 'Tiada rosak atau hilang direkodkan.',
  '3. Close the month': '3. Tutup bulan',
  '+ Bought': '+ Dibeli',
  '+ Other in': '+ Masuk lain',
  '− Used': '− Digunakan',
  '− Wasted / missing': '− Rosak / hilang',
  '− Lent / returned / count': '− Dipinjam / dipulang / kiraan',

  // Add / edit product
  'Add stock item': 'Tambah produk stok',
  'Product name': 'Nama produk',
  'Sold in': 'Dijual dalam',
  'e.g. bag, bottle, pcs': 'cth. beg, botol, biji',
  'How many in one carton': 'Berapa dalam satu karton',
  '1 if it has no carton': '1 jika tiada karton',
  'Price of one carton (RM)': 'Harga satu karton (RM)',
  'Orders are grouped by supplier': 'Pesanan dikumpulkan mengikut pembekal',
  'How many do you have on the shelf now?': 'Berapa yang ada di rak sekarang?',
  'Leave at 0 if you have none yet. You can count the shelf later.': 'Biarkan 0 jika belum ada. Anda boleh kira rak kemudian.',
  '▸ More details (code, group, re-order, shelf life, notes)': '▸ Butiran lanjut (kod, kumpulan, tempah semula, jangka hayat, nota)',
  '▾ Fewer details': '▾ Kurang butiran',
  'Add item': 'Tambah produk',
  'Save item': 'Simpan produk',
  'Item code': 'Kod produk',
  'Description': 'Keterangan',
  'Group': 'Kumpulan',
  'Notes': 'Nota',
  'Type the product name first.': 'Taip nama produk dahulu.',
  'Type how many are in one carton (1 if none).': 'Taip berapa dalam satu karton (1 jika tiada).',
  'Saving…': 'Menyimpan…',

  // Stock list
  'Order now': 'Perlu dipesan',
  'Running low': 'Hampir habis',
  'Expired / expiring': 'Tamat tempoh / hampir',
  'Stock value': 'Nilai stok',
  'Nothing below the re-order level': 'Tiada di bawah paras tempah semula',
  'Within half a month of the re-order level': 'Dalam setengah bulan daripada paras tempah semula',
  'All groups': 'Semua kumpulan',
  'Code': 'Kod',
  'In stock': 'Dalam stok',
  'Months left': 'Baki bulan',
  'Used / month': 'Guna / bulan',
  'To order': 'Perlu pesan',
  'Expiry': 'Tamat tempoh',
  'Below zero: count it': 'Bawah sifar: kira semula',
  'Expired: check shelf': 'Tamat tempoh: semak rak',
  'On order': 'Dalam pesanan',

  // Why it was wasted
  'Why was it wasted?': 'Kenapa ia rosak?',
  'Expired': 'Tamat tempoh',
  'Spilled / damaged': 'Tumpah / rosak',
  'Staff meal': 'Makanan staf',
  'Sample / promotion': 'Sampel / promosi',
  'Wrong order / returned': 'Salah pesanan / dipulangkan',
  'Other / missing': 'Lain-lain / hilang',

  // Product panel
  'Edit': 'Ubah',
  'Stop using this product': 'Berhenti guna produk ini',
  'Use this product again': 'Guna produk ini semula',
  '+ Stock in': '+ Stok masuk',
  '− Take out': '− Keluarkan',
  'Products no longer used': 'Produk tidak digunakan lagi',
};

export const tr = (text: string) => (current === 'ms' ? (MS[text] ?? text) : text);

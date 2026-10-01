(() => {
  'use strict';

  const STORAGE_KEY = 'djiwaruang-invoice-v1';
  const DATABASE_NAME = 'djiwaruang-invoice-db';
  const DATABASE_VERSION = 1;
  const DOCUMENT_STORE = 'documents';
  const today = new Date().toISOString().slice(0, 10);
  const defaultState = {
    id: createDocumentId(),
    type: 'invoice',
    pricingMode: 'build',
    status: 'unpaid',
    number: `INV-${new Date().getFullYear()}-0001`,
    date: today,
    paidDate: '',
    createdAt: new Date().toISOString(),
    clientName: '',
    clientAddress: '',
    discount: 0,
    roundingMode: 'none',
    roundingUnit: 1000000,
    manualTotal: '',
    notes: '',
    items: [
      { description: '', quantity: 1, price: 0, free: false }
    ],
    payments: [
      { label: 'DP 50%', detail: today, percent: 50 },
      { label: 'Pelunasan', detail: 'Sebelum pengiriman', percent: 50 }
    ],
    business: {
      name: 'DJIWARUANG', tagline: 'INTERIOR & SPATIAL DESIGN', accountName: 'M. Doni Syahtria', bankName: 'BNI',
      accountNumber: '0721962210', contact: '', logo: ''
    },
    visibility: {
      brandHeader: true, clientMeta: true, status: true, tableHeader: true,
      unitPrice: true, quantity: true, rounding: true, payments: true, notes: true,
      fingerprint: true, paymentMethod: true, paidStamp: true
    }
  };

  let state = loadState();
  let saveTimer;
  let toastTimer;
  let fingerprintGeneration = 0;
  let databasePromise;
  let fitFrame;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function createDocumentId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeState(saved) {
    const source = saved && typeof saved === 'object' ? saved : {};
    return {
      ...structuredClone(defaultState), ...source,
      id: String(source.id || createDocumentId()),
      business: { ...defaultState.business, ...(source.business || {}) },
      visibility: { ...defaultState.visibility, ...(source.visibility || {}) },
      items: Array.isArray(source.items) && source.items.length
        ? source.items.map(item => ({
            description: String(item?.description || ''), quantity: item?.quantity ?? 1,
            price: item?.price ?? 0, free: Boolean(item?.free)
          }))
        : structuredClone(defaultState.items),
      payments: Array.isArray(source.payments)
        ? source.payments.map(payment => ({
            label: String(payment?.label || ''), detail: String(payment?.detail || ''),
            percent: payment?.percent ?? 0
          }))
        : structuredClone(defaultState.payments)
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeState(saved);
    } catch {
      return normalizeState(null);
    }
  }

  function saveState() {
    const status = $('#saveState');
    status.lastChild.textContent = 'Menyimpan…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        status.lastChild.textContent = 'Draft tersimpan lokal';
      } catch {
        status.lastChild.textContent = 'Penyimpanan penuh';
      }
    }, 300);
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function numberValue(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', maximumFractionDigits: 0
    }).format(Math.round(numberValue(value))).replace(/\s/g, '');
  }

  function formatQuantity(value) {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 }).format(numberValue(value));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date).toUpperCase();
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date).replace('.', ':').toUpperCase();
  }

  function numberToIndonesianWords(value) {
    const number = Math.max(0, Math.round(numberValue(value)));
    if (number === 0) return 'Nol';
    const basic = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    const spell = current => {
      if (current < 12) return basic[current];
      if (current < 20) return `${spell(current - 10)} belas`;
      if (current < 100) return `${spell(Math.floor(current / 10))} puluh ${spell(current % 10)}`;
      if (current < 200) return `seratus ${spell(current - 100)}`;
      if (current < 1000) return `${spell(Math.floor(current / 100))} ratus ${spell(current % 100)}`;
      if (current < 2000) return `seribu ${spell(current - 1000)}`;
      if (current < 1000000) return `${spell(Math.floor(current / 1000))} ribu ${spell(current % 1000)}`;
      if (current < 1000000000) return `${spell(Math.floor(current / 1000000))} juta ${spell(current % 1000000)}`;
      if (current < 1000000000000) return `${spell(Math.floor(current / 1000000000))} miliar ${spell(current % 1000000000)}`;
      if (current < 1000000000000000) return `${spell(Math.floor(current / 1000000000000))} triliun ${spell(current % 1000000000000)}`;
      return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(current);
    };
    const words = spell(number).replace(/\s+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function statusLabel(status) {
    return ({
      unpaid: 'BELUM LUNAS', partial: 'DIBAYAR SEBAGIAN', paid: 'LUNAS',
      draft: 'DRAFT', cancelled: 'DIBATALKAN'
    })[status] || 'ORIGINAL';
  }

  function calculate(source = state) {
    const subtotal = source.items.reduce((sum, item) => sum + (item.free ? 0 : numberValue(item.price) * numberValue(item.quantity)), 0);
    const discount = subtotal * Math.min(100, Math.max(0, numberValue(source.discount))) / 100;
    const calculated = subtotal - discount;
    let total = calculated;
    let adjustmentLabel = 'PEMBULATAN';
    if (source.manualTotal !== '') {
      total = numberValue(source.manualTotal);
      adjustmentLabel = 'PENYESUAIAN TOTAL';
    } else if (source.roundingMode !== 'none') {
      const unit = Math.max(1, numberValue(source.roundingUnit));
      if (source.roundingMode === 'up') total = Math.ceil(calculated / unit) * unit;
      if (source.roundingMode === 'down') total = Math.floor(calculated / unit) * unit;
      if (source.roundingMode === 'nearest') total = Math.round(calculated / unit) * unit;
    }
    const adjustment = total - calculated;
    return { subtotal, discount, calculated, adjustment, adjustmentLabel, total };
  }

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB tidak didukung oleh browser ini.'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
          const store = database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Database lokal tidak dapat dibuka.'));
    });
    return databasePromise;
  }

  async function getAllDocuments() {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async function getDocument(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = database.transaction(DOCUMENT_STORE, 'readonly').objectStore(DOCUMENT_STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putDocument(record) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
      transaction.objectStore(DOCUMENT_STORE).put(record);
      transaction.oncomplete = () => resolve(record);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function removeDocument(id) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
      transaction.objectStore(DOCUMENT_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  function renderItemsEditor() {
    const isDesign = state.pricingMode === 'design';
    $('#itemsEditor').innerHTML = state.items.map((item, index) => `
      <div class="item-card" data-item-index="${index}">
        <div class="item-card-top">
          <span class="item-number">${index + 1}</span>
          <textarea class="inline-input item-description-input" data-field="description" rows="2" placeholder="${isDesign ? 'Jasa desain dan ruang lingkup pekerjaan' : 'Deskripsi pekerjaan / barang'}">${escapeHtml(item.description)}</textarea>
          <button class="remove-button" data-action="remove-item" title="Hapus item" type="button">×</button>
        </div>
        <div class="item-card-grid">
          <label class="mini-field"><span>${isDesign ? 'Harga / m²' : 'Harga satuan'}</span><input class="inline-input" data-field="price" type="number" min="0" value="${numberValue(item.price)}"></label>
          <label class="mini-field"><span>${isDesign ? 'Luas (m²)' : 'Quantity'}</span><input class="inline-input" data-field="quantity" type="number" min="0" step="0.01" value="${numberValue(item.quantity)}"></label>
          <label class="mini-field"><span>Total</span><input class="inline-input" value="${item.free ? 'FREE' : formatCurrency(numberValue(item.price) * numberValue(item.quantity))}" disabled></label>
        </div>
        <label class="free-toggle"><input data-field="free" type="checkbox" ${item.free ? 'checked' : ''}> Tandai sebagai gratis</label>
      </div>`).join('');
  }

  function renderPaymentsEditor() {
    const container = $('#paymentsEditor');
    if (!state.payments.length) {
      container.innerHTML = '<p class="help-text">Belum ada jadwal pembayaran.</p>';
      return;
    }
    container.innerHTML = state.payments.map((payment, index) => `
      <div class="payment-card" data-payment-index="${index}">
        <div class="payment-card-top">
          <span class="item-number">${index + 1}</span>
          <input class="inline-input" data-field="label" value="${escapeHtml(payment.label)}" placeholder="Contoh: DP 50%">
          <button class="remove-button" data-action="remove-payment" title="Hapus termin" type="button">×</button>
        </div>
        <div class="payment-card-grid">
          <label class="mini-field"><span>Persentase</span><input class="inline-input" data-field="percent" type="number" min="0" max="100" step="0.1" value="${numberValue(payment.percent)}"></label>
          <label class="mini-field"><span>Tanggal / keterangan</span><input class="inline-input" data-field="detail" value="${escapeHtml(payment.detail)}" placeholder="Sebelum pengiriman"></label>
        </div>
      </div>`).join('');
  }

  function renderPreview() {
    const isInvoice = state.type === 'invoice';
    const isDesign = state.pricingMode === 'design';
    const { subtotal, discount, adjustment, adjustmentLabel, total } = calculate();
    const visibility = state.visibility;
    $('#previewType').textContent = isInvoice ? 'INVOICE' : 'PENAWARAN';
    $('#recipientLabel').textContent = isInvoice ? 'TAGIHAN KEPADA' : 'PENAWARAN KEPADA';
    $('#numberLabel').textContent = isInvoice ? 'NO. INVOICE' : 'NO. PENAWARAN';
    $('#previewNumber').textContent = state.number || '—';
    $('#previewDate').textContent = formatDate(state.date);
    $('#previewClientName').textContent = state.clientName || 'Nama Pelanggan';
    $('#previewClientAddress').textContent = state.clientAddress || '';
    const columns = [{ key: 'description', label: 'DESKRIPSI' }];
    const priceColumn = { key: 'price', label: isDesign ? 'HARGA / M²' : 'HARGA SATUAN' };
    const quantityColumn = { key: 'quantity', label: isDesign ? 'LUAS' : 'QTY' };
    if (isDesign) {
      if (visibility.quantity) columns.push(quantityColumn);
      if (visibility.unitPrice) columns.push(priceColumn);
    } else {
      if (visibility.unitPrice) columns.push(priceColumn);
      if (visibility.quantity) columns.push(quantityColumn);
    }
    columns.push({ key: 'total', label: 'TOTAL' });
    const middleCount = columns.length - 2;
    const widths = middleCount === 2
      ? (isDesign ? [45, 15, 18, 22] : [46, 22, 10, 22])
      : middleCount === 1 ? [58, 20, 22] : [76, 24];
    $('#previewColGroup').innerHTML = widths.map(width => `<col style="width:${width}%">`).join('');
    $('#previewTableHead').innerHTML = `<tr>${columns.map(column => `<th class="col-${column.key}">${column.label}</th>`).join('')}</tr>`;
    $('#previewTableHead').hidden = !visibility.tableHeader;
    $('#previewItems').innerHTML = state.items.some(item => item.description.trim())
      ? state.items.filter(item => item.description.trim()).map((item, index) => {
          const lineTotal = numberValue(item.price) * numberValue(item.quantity);
          const cells = {
            description: `<td class="col-description"><div class="description-cell"><span class="line-index">${String(index + 1).padStart(2, '0')}</span><span class="line-description">${escapeHtml(item.description)}</span></div></td>`,
            price: `<td class="col-price">${item.free ? 'FREE' : formatCurrency(item.price)}</td>`,
            quantity: `<td class="col-quantity">${formatQuantity(item.quantity)}${isDesign ? ' m²' : ''}</td>`,
            total: `<td class="col-total">${item.free ? 'FREE' : formatCurrency(lineTotal)}</td>`
          };
          return `<tr>${columns.map(column => cells[column.key]).join('')}</tr>`;
        }).join('')
      : `<tr class="empty-row"><td colspan="${columns.length}">Tambahkan item dari panel di sebelah kiri</td></tr>`;
    $('#previewSubtotal').textContent = formatCurrency(subtotal);
    $('#discountLabel').textContent = `DISKON ${formatQuantity(state.discount)}%`;
    $('#previewDiscount').textContent = `− ${formatCurrency(discount)}`;
    $('#discountRow').hidden = numberValue(state.discount) <= 0;
    $('#roundingLabel').textContent = adjustmentLabel;
    $('#previewRounding').textContent = `${adjustment >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(adjustment))}`;
    $('#roundingRow').hidden = !visibility.rounding || Math.abs(adjustment) < 0.5;
    $('#previewGrandTotal').textContent = formatCurrency(total);
    $('#previewAmountWords').textContent = `${numberToIndonesianWords(total)} rupiah`;
    const showPaidStamp = isInvoice && state.status === 'paid' && visibility.paidStamp !== false;
    $('#previewPaidStamp').hidden = !showPaidStamp;
    $('#previewPaidDate').textContent = `DIBAYAR ${formatDate(state.paidDate || state.date)}`;

    const paymentSection = $('#previewPaymentSection');
    paymentSection.hidden = !visibility.payments || state.payments.length === 0;
    $('#previewPayments').innerHTML = state.payments.map(payment => `
      <div class="payment-line"><strong>${escapeHtml(payment.label || 'TERMIN')}</strong><span>${escapeHtml(payment.detail || '—')}</span><span>${formatCurrency(total * numberValue(payment.percent) / 100)}</span></div>
    `).join('');

    $('#previewNotesSection').hidden = !visibility.notes || !state.notes.trim();
    $('#previewNotes').textContent = state.notes;
    $('#previewBrandHeader').textContent = state.business.name || 'NAMA USAHA';
    $('#previewTagline').textContent = state.business.tagline || 'INTERIOR & SPATIAL DESIGN';
    $('#previewHeaderNumber').textContent = state.number || '—';
    const status = $('#previewStatus');
    status.textContent = statusLabel(state.status);
    status.dataset.status = state.status;
    status.hidden = !visibility.status;
    $('.document-header').hidden = !visibility.brandHeader;
    $('.document-meta').hidden = !visibility.clientMeta;
    $('.security-strip').hidden = !visibility.fingerprint;
    $('.bank-details').hidden = !visibility.paymentMethod;
    $('#previewAccountName').textContent = `Nama Rekening : ${state.business.accountName || '—'}`;
    $('#previewAccountNumber').textContent = `${state.business.bankName || 'Bank'} : ${state.business.accountNumber || '—'}`;
    $('#previewContact').textContent = state.business.contact || '';
    const headerLogo = $('#previewHeaderLogo');
    const headerMonogram = $('#previewHeaderMonogram');
    if (state.business.logo) {
      headerLogo.src = state.business.logo;
      headerLogo.style.display = 'block';
      headerMonogram.style.display = 'none';
    } else {
      headerLogo.removeAttribute('src');
      headerLogo.style.display = 'none';
      headerMonogram.style.display = 'grid';
    }
    $('#previewCreatedAt').textContent = formatDateTime(state.createdAt);
    renderFingerprint();
    schedulePaperFit();
  }

  function schedulePaperFit() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitPaperToSinglePage);
  }

  function fitPaperToSinglePage() {
    const paper = $('#invoicePaper');
    const content = $('#paperContent');
    const scaleLabel = $('#previewScaleLabel');
    if (!paper || !content || !scaleLabel) return;

    let scale = 1;
    paper.style.setProperty('--fit-scale', '1');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      paper.style.setProperty('--fit-scale', scale.toFixed(4));
      const targetHeight = paper.clientHeight;
      const renderedHeight = content.scrollHeight * scale;
      if (renderedHeight <= targetHeight + 1) break;
      scale = Math.max(0.2, Math.min(1, scale * targetHeight / renderedHeight * 0.998));
    }

    paper.style.setProperty('--fit-scale', scale.toFixed(4));
    scaleLabel.textContent = `Auto · ${Math.round(scale * 100)}%`;
  }

  async function renderFingerprint() {
    const generation = ++fingerprintGeneration;
    const payload = JSON.stringify({
      number: state.number, type: state.type, status: state.status, date: state.date,
      pricingMode: state.pricingMode,
      createdAt: state.createdAt, paidDate: state.paidDate, client: state.clientName, items: state.items,
      discount: state.discount, roundingMode: state.roundingMode, roundingUnit: state.roundingUnit,
      manualTotal: state.manualTotal, business: state.business.name, visibility: state.visibility
    });
    let hex = '';
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
      hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      let hash = 2166136261;
      for (let index = 0; index < payload.length; index += 1) {
        hash ^= payload.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      hex = (hash >>> 0).toString(16).padStart(8, '0').repeat(8);
    }
    if (generation !== fingerprintGeneration) return;
    const code = `DJI-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`.toUpperCase();
    $('#previewFingerprint').textContent = code;
    renderSecurityMatrix(hex);
  }

  function renderSecurityMatrix(hex) {
    const bits = [...hex].flatMap(char => Number.parseInt(char, 16).toString(2).padStart(4, '0').split(''));
    let bitIndex = 0;
    const finder = (x, y, offsetX, offsetY) => {
      const localX = x - offsetX;
      const localY = y - offsetY;
      if (localX < 0 || localY < 0 || localX > 4 || localY > 4) return null;
      return localX === 0 || localY === 0 || localX === 4 || localY === 4 || (localX === 2 && localY === 2);
    };
    const cells = [];
    for (let y = 0; y < 13; y += 1) {
      for (let x = 0; x < 13; x += 1) {
        const fixed = finder(x, y, 0, 0) ?? finder(x, y, 8, 0) ?? finder(x, y, 0, 8);
        const on = fixed === null ? bits[bitIndex++ % bits.length] === '1' : fixed;
        cells.push(`<i class="${on ? 'on' : ''}"></i>`);
      }
    }
    $('#securityMatrix').innerHTML = cells.join('');
  }

  function renderAll() {
    $$(`input[name="documentType"]`).forEach(input => input.checked = input.value === state.type);
    $('#documentNumber').value = state.number;
    $('#documentDate').value = state.date;
    $('#paidDate').value = state.paidDate || state.date;
    $('#pricingMode').value = state.pricingMode;
    $('#documentStatus').value = state.status;
    $('#clientName').value = state.clientName;
    $('#clientAddress').value = state.clientAddress;
    $('#discountPercent').value = state.discount;
    $('#roundingMode').value = state.roundingMode;
    $('#roundingUnit').value = String(state.roundingUnit);
    $('#manualTotal').value = state.manualTotal;
    $('#notes').value = state.notes;
    $('#businessName').value = state.business.name;
    $('#businessTagline').value = state.business.tagline;
    $('#accountName').value = state.business.accountName;
    $('#bankName').value = state.business.bankName;
    $('#accountNumber').value = state.business.accountNumber;
    $('#businessContact').value = state.business.contact;
    $$('[data-visibility]').forEach(input => {
      input.checked = state.visibility[input.dataset.visibility] !== false;
    });
    syncPaidDateField();
    syncRoundingControls();
    renderItemsEditor();
    renderPaymentsEditor();
    renderPreview();
  }

  function makeHistoryRecord(documentState = state, updatedAt = new Date().toISOString()) {
    const normalized = normalizeState(documentState);
    const { total } = calculate(normalized);
    return {
      id: normalized.id,
      number: normalized.number,
      type: normalized.type,
      clientName: normalized.clientName,
      date: normalized.date,
      total,
      updatedAt,
      data: normalized
    };
  }

  async function saveCurrentDocument() {
    try {
      if (!state.id) state.id = createDocumentId();
      await putDocument(makeHistoryRecord(state));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      showToast('Dokumen tersimpan di riwayat.');
      if (!$('#historyModal').hidden) await renderHistory();
    } catch (error) {
      console.error(error);
      showToast('Dokumen gagal disimpan. Periksa izin penyimpanan browser.');
    }
  }

  async function renderHistory() {
    const list = $('#historyList');
    list.innerHTML = '<div class="history-empty">Memuat riwayat…</div>';
    try {
      const query = $('#historySearch').value.trim().toLowerCase();
      const documents = (await getAllDocuments())
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
        .filter(document => !query || [document.number, document.clientName, document.type]
          .some(value => String(value || '').toLowerCase().includes(query)));
      if (!documents.length) {
        list.innerHTML = `<div class="history-empty"><div><strong>${query ? 'Dokumen tidak ditemukan' : 'Riwayat masih kosong'}</strong>${query ? 'Coba kata pencarian lain.' : 'Klik “Simpan dokumen saat ini” untuk membuat arsip pertama.'}</div></div>`;
        return;
      }
      list.innerHTML = documents.map(document => `
        <article class="history-item" data-document-id="${escapeHtml(document.id)}">
          <div class="history-item-main">
            <strong>${escapeHtml(document.number || 'Tanpa nomor')} · ${escapeHtml(document.clientName || 'Tanpa nama pelanggan')}</strong>
            <p><span class="history-item-type">${document.type === 'quotation' ? 'PENAWARAN' : 'INVOICE'}</span>${escapeHtml(formatDate(document.date))}</p>
          </div>
          <div class="history-item-meta">
            <p class="history-item-total">${formatCurrency(document.total)}</p>
            <p>Diperbarui ${escapeHtml(formatDateTime(document.updatedAt))}</p>
          </div>
          <div class="history-item-actions">
            <button class="history-action" data-history-action="open" type="button">Buka</button>
            <button class="history-action" data-history-action="duplicate" type="button">Duplikat</button>
            <button class="history-action danger" data-history-action="delete" type="button">Hapus</button>
          </div>
        </article>`).join('');
    } catch (error) {
      console.error(error);
      list.innerHTML = '<div class="history-empty"><div><strong>Riwayat tidak dapat dibuka</strong>Browser mungkin memblokir penyimpanan lokal untuk file ini.</div></div>';
    }
  }

  async function openHistoryDocument(id) {
    try {
      const record = await getDocument(id);
      if (!record?.data) throw new Error('Dokumen tidak ditemukan.');
      state = normalizeState({ ...record.data, id: record.id });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      closeHistory();
      showToast('Dokumen dibuka dari riwayat.');
    } catch (error) {
      console.error(error);
      showToast('Dokumen tidak dapat dibuka.');
    }
  }

  async function duplicateHistoryDocument(id) {
    try {
      const record = await getDocument(id);
      if (!record?.data) throw new Error('Dokumen tidak ditemukan.');
      const copy = normalizeState(record.data);
      copy.id = createDocumentId();
      copy.createdAt = new Date().toISOString();
      copy.number = `${copy.number || (copy.type === 'quotation' ? 'QT' : 'INV')}-COPY`;
      copy.status = copy.type === 'quotation' ? 'draft' : 'unpaid';
      state = copy;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      closeHistory();
      showToast('Salinan dibuat sebagai draft baru.');
    } catch (error) {
      console.error(error);
      showToast('Dokumen gagal diduplikat.');
    }
  }

  async function exportBackup() {
    try {
      const payload = {
        app: 'djiwaruang-invoice', version: 1, exportedAt: new Date().toISOString(),
        draft: state, documents: await getAllDocuments()
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `djiwaruang-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('Backup berhasil diekspor.');
    } catch (error) {
      console.error(error);
      showToast('Backup gagal dibuat.');
    }
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 25000000) { showToast('File backup terlalu besar.'); return; }
    try {
      const payload = JSON.parse(await file.text());
      if (payload?.app !== 'djiwaruang-invoice' || !Array.isArray(payload.documents)) {
        throw new Error('Format backup tidak dikenali.');
      }
      if (!confirm(`Impor ${payload.documents.length} dokumen? Dokumen dengan ID yang sama akan diperbarui.`)) return;
      for (const sourceRecord of payload.documents) {
        const data = normalizeState(sourceRecord?.data);
        const id = String(sourceRecord?.id || data.id || createDocumentId());
        data.id = id;
        await putDocument(makeHistoryRecord(data, sourceRecord?.updatedAt || new Date().toISOString()));
      }
      if (payload.draft) {
        state = normalizeState(payload.draft);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
      }
      await renderHistory();
      showToast(`${payload.documents.length} dokumen berhasil diimpor.`);
    } catch (error) {
      console.error(error);
      showToast('File backup tidak valid atau gagal dibaca.');
    } finally {
      $('#importBackupInput').value = '';
    }
  }

  async function openHistory() {
    $('#historyModal').hidden = false;
    document.body.classList.add('modal-open');
    $('#historySearch').value = '';
    await renderHistory();
    $('#historySearch').focus();
  }

  function closeHistory() {
    $('#historyModal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  function updateAndRender() {
    renderPreview();
    saveState();
  }

  function syncRoundingControls() {
    const usesManualTotal = state.manualTotal !== '';
    $('#roundingUnit').disabled = state.roundingMode === 'none' || usesManualTotal;
    $('#roundingMode').title = usesManualTotal ? 'Total manual sedang digunakan.' : '';
  }

  function syncPaidDateField() {
    const show = state.type === 'invoice' && state.status === 'paid';
    $('#paidDateField').hidden = !show;
    $('#paidDate').disabled = !show;
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function bindEvents() {
    $$('.tab').forEach(tab => tab.addEventListener('click', () => {
      $$('.tab').forEach(item => item.classList.toggle('active', item === tab));
      $$('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab));
    }));

    $$(`input[name="documentType"]`).forEach(input => input.addEventListener('change', event => {
      state.type = event.target.value;
      if (state.type === 'quotation' && state.status === 'unpaid') state.status = 'draft';
      if (state.type === 'invoice' && state.status === 'draft') state.status = 'unpaid';
      $('#documentStatus').value = state.status;
      syncPaidDateField();
      if (/^(INV|QT)-\d{4}-\d{4}$/.test(state.number)) {
        state.number = state.number.replace(/^(INV|QT)/, state.type === 'invoice' ? 'INV' : 'QT');
        $('#documentNumber').value = state.number;
      }
      updateAndRender();
    }));

    const simpleBindings = {
      documentNumber: ['number'], documentDate: ['date'], paidDate: ['paidDate'], pricingMode: ['pricingMode'], documentStatus: ['status'], clientName: ['clientName'],
      clientAddress: ['clientAddress'], discountPercent: ['discount'], roundingMode: ['roundingMode'],
      roundingUnit: ['roundingUnit'], manualTotal: ['manualTotal'], notes: ['notes']
    };
    Object.entries(simpleBindings).forEach(([id, path]) => {
      $(`#${id}`).addEventListener('input', event => {
        state[path[0]] = event.target.value;
        if (id === 'documentStatus') {
          if (state.status === 'paid' && !state.paidDate) {
            state.paidDate = today;
            $('#paidDate').value = state.paidDate;
          }
          syncPaidDateField();
        }
        if (id === 'pricingMode') renderItemsEditor();
        if (id === 'roundingMode' || id === 'manualTotal') syncRoundingControls();
        updateAndRender();
      });
    });

    const businessBindings = {
      businessName: 'name', businessTagline: 'tagline', accountName: 'accountName', bankName: 'bankName',
      accountNumber: 'accountNumber', businessContact: 'contact'
    };
    Object.entries(businessBindings).forEach(([id, key]) => {
      $(`#${id}`).addEventListener('input', event => {
        state.business[key] = event.target.value;
        updateAndRender();
      });
    });

    $('#visibilityControls').addEventListener('change', event => {
      const key = event.target.dataset.visibility;
      if (!key) return;
      state.visibility[key] = event.target.checked;
      updateAndRender();
    });

    $('#itemsEditor').addEventListener('input', event => {
      const card = event.target.closest('[data-item-index]');
      if (!card || !event.target.dataset.field) return;
      const item = state.items[Number(card.dataset.itemIndex)];
      const field = event.target.dataset.field;
      item[field] = field === 'free' ? event.target.checked : event.target.value;
      if (field === 'price' || field === 'quantity' || field === 'free') {
        const totalInput = card.querySelector('.item-card-grid .mini-field:last-child input');
        totalInput.value = item.free ? 'FREE' : formatCurrency(numberValue(item.price) * numberValue(item.quantity));
      }
      updateAndRender();
    });
    $('#itemsEditor').addEventListener('click', event => {
      if (event.target.dataset.action !== 'remove-item') return;
      if (state.items.length === 1) { showToast('Dokumen perlu memiliki minimal satu item.'); return; }
      state.items.splice(Number(event.target.closest('[data-item-index]').dataset.itemIndex), 1);
      renderItemsEditor(); updateAndRender();
    });
    const addItem = () => {
      state.items.push({ description: '', quantity: 1, price: 0, free: false });
      renderItemsEditor(); updateAndRender();
      requestAnimationFrame(() => {
        const cards = $$('.item-card');
        const description = cards[cards.length - 1]?.querySelector('[data-field="description"]');
        description?.focus();
        description?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    };
    $('#addItemBtn').addEventListener('click', addItem);
    $('#addItemBottomBtn').addEventListener('click', addItem);
    $('#itemsEditor').addEventListener('keydown', event => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
      event.preventDefault();
      addItem();
    });

    $('#paymentsEditor').addEventListener('input', event => {
      const card = event.target.closest('[data-payment-index]');
      if (!card || !event.target.dataset.field) return;
      state.payments[Number(card.dataset.paymentIndex)][event.target.dataset.field] = event.target.value;
      updateAndRender();
    });
    $('#paymentsEditor').addEventListener('click', event => {
      if (event.target.dataset.action !== 'remove-payment') return;
      state.payments.splice(Number(event.target.closest('[data-payment-index]').dataset.paymentIndex), 1);
      renderPaymentsEditor(); updateAndRender();
    });
    $('#addPaymentBtn').addEventListener('click', () => {
      state.payments.push({ label: 'Termin', detail: '', percent: 0 });
      renderPaymentsEditor(); updateAndRender();
    });

    $('#logoInput').addEventListener('change', event => {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1500000) { showToast('Ukuran logo maksimal 1,5 MB.'); event.target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { state.business.logo = reader.result; updateAndRender(); showToast('Logo berhasil dipasang.'); };
      reader.readAsDataURL(file);
    });
    $('#removeLogoBtn').addEventListener('click', () => {
      state.business.logo = ''; $('#logoInput').value = ''; updateAndRender(); showToast('Logo dihapus.');
    });

    $('#saveDocumentBtn').addEventListener('click', saveCurrentDocument);
    $('#saveFromModalBtn').addEventListener('click', saveCurrentDocument);
    $('#historyBtn').addEventListener('click', openHistory);
    $('#closeHistoryBtn').addEventListener('click', closeHistory);
    $('#historyModal').addEventListener('click', event => {
      if (event.target === $('#historyModal')) closeHistory();
    });
    $('#historySearch').addEventListener('input', renderHistory);
    $('#exportBackupBtn').addEventListener('click', exportBackup);
    $('#importBackupInput').addEventListener('change', event => importBackup(event.target.files[0]));
    $('#historyList').addEventListener('click', async event => {
      const button = event.target.closest('[data-history-action]');
      const item = event.target.closest('[data-document-id]');
      if (!button || !item) return;
      const id = item.dataset.documentId;
      if (button.dataset.historyAction === 'open') await openHistoryDocument(id);
      if (button.dataset.historyAction === 'duplicate') await duplicateHistoryDocument(id);
      if (button.dataset.historyAction === 'delete') {
        if (!confirm('Hapus dokumen ini dari riwayat? File backup yang pernah diekspor tidak terpengaruh.')) return;
        try {
          await removeDocument(id);
          await renderHistory();
          showToast('Dokumen dihapus dari riwayat.');
        } catch (error) {
          console.error(error);
          showToast('Dokumen gagal dihapus.');
        }
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#historyModal').hidden) closeHistory();
    });
    window.addEventListener('beforeprint', fitPaperToSinglePage);

    $('#printBtn').addEventListener('click', () => {
      showToast('Pilih “Save as PDF” pada dialog cetak.');
      setTimeout(() => window.print(), 250);
    });
    $('#newDocumentBtn').addEventListener('click', () => {
      if (!confirm('Buat dokumen baru? Data dokumen saat ini akan diganti.')) return;
      const business = structuredClone(state.business);
      state = structuredClone(defaultState);
      state.id = createDocumentId();
      state.createdAt = new Date().toISOString();
      state.business = business;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll(); showToast('Dokumen baru siap diisi.');
    });
  }

  renderAll();
  bindEvents();
})();

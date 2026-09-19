/**
 * OTP Finder - Cari OTP dari email temporary
 */

const API_BASE = '/api';

const elements = {
  emailInput: document.getElementById('email-input'),
  btnSearch: document.getElementById('btn-search'),
  otpResult: document.getElementById('otp-result'),
  resultEmail: document.getElementById('result-email'),
  resultLoading: document.getElementById('result-loading'),
  resultList: document.getElementById('result-list'),
  resultEmpty: document.getElementById('result-empty'),
};

function showResult() {
  elements.otpResult.classList.remove('hidden');
}

function setLoading(loading) {
  if (loading) {
    elements.resultLoading.classList.remove('hidden');
    elements.resultList.innerHTML = '';
    elements.resultList.style.display = 'none';
    elements.resultEmpty.classList.add('hidden');
  } else {
    elements.resultLoading.classList.add('hidden');
    elements.resultList.style.display = '';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'Baru saja';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function searchOtp() {
  const email = elements.emailInput.value.trim();
  if (!email) {
    elements.emailInput.focus();
    return;
  }
  if (!email.includes('@')) {
    alert('Masukkan alamat email yang valid.');
    return;
  }

  showResult();
  elements.resultEmail.textContent = email;
  setLoading(true);
  elements.btnSearch.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/otp/${encodeURIComponent(email)}`);
    const data = await res.json();

    if (!data.success) {
      elements.resultList.innerHTML = '';
      elements.resultEmpty.classList.remove('hidden');
      elements.resultEmpty.querySelector('p').textContent = data.error || 'Gagal memuat data.';
      return;
    }

    const items = data.data?.items || [];

    if (items.length === 0) {
      elements.resultList.innerHTML = '';
      elements.resultEmpty.classList.remove('hidden');
      elements.resultEmpty.querySelector('p').textContent = 'Belum ada email atau tidak ada kode OTP yang terdeteksi.';
      return;
    }

    const withOtp = items.filter((i) => i.otp);
    if (withOtp.length === 0) {
      elements.resultList.innerHTML = '';
      elements.resultEmpty.classList.remove('hidden');
      elements.resultEmpty.querySelector('p').textContent = 'Email ditemukan tetapi tidak ada kode OTP yang terdeteksi. Tunggu 30-60 detik lalu coba lagi.';
      return;
    }

    elements.resultEmpty.classList.add('hidden');
    elements.resultList.innerHTML = withOtp
      .map(
        (item) => `
      <li class="otp-item">
        <div class="otp-item__from">${escapeHtml(item.from)}</div>
        <div class="otp-item__subject">${escapeHtml(item.subject)}</div>
        <div class="otp-item__row">
          <span class="otp-item__code">${escapeHtml(item.otp)}</span>
          <span class="otp-item__time">${formatTime(item.receivedAt)}</span>
        </div>
      </li>
    `
      )
      .join('');
  } catch (err) {
    console.error(err);
    elements.resultList.innerHTML = '';
    elements.resultEmpty.classList.remove('hidden');
    elements.resultEmpty.querySelector('p').textContent = 'Gagal memuat. Periksa koneksi atau coba lagi.';
  } finally {
    setLoading(false);
    elements.btnSearch.disabled = false;
  }
}

elements.btnSearch.addEventListener('click', searchOtp);
elements.emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchOtp();
});

// Prefill from localStorage (same key as main page)
const savedEmail = localStorage.getItem('hubify_email');
if (savedEmail) {
  elements.emailInput.value = savedEmail;
  elements.emailInput.placeholder = savedEmail;
}

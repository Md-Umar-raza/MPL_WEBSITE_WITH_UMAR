/* 1=====================================================================
   MOKAMO PREMIER LEAGUE - SEASON 2 / 2027
   Frontend logic — talks to the Code.gs Google Apps Script backend to
   save registrations into a Google Sheet and upload payment
   screenshots to Google Drive.
===================================================================== */

const ADMIN_PIN = '2027'; // Reference only — the PIN is actually verified by Code.gs (Google Apps Script). Keep both in sync.

// ⚠️ IMPORTANT: replace this with YOUR real UPI ID (VPA) before going live,
// e.g. "9661926530@ybl" / "9661926530@okicici" / "yourname@upi".
const UPI_ID = '9661926530@ybl';
const UPI_PAYEE_NAME = 'Mokamo Premier League';

/* ---------------------------------------------------------------------
   EMAIL NOTIFICATIONS (EmailJS) — fill these in to get an email every
   time someone registers. This is a free client-side email service,
   no backend server needed.

   Setup (takes ~5 minutes):
   1. Go to https://www.emailjs.com and create a free account.
   2. Add an Email Service (e.g. connect your Gmail) → copy the "Service ID".
   3. Create an Email Template with a body using variables like:
        {{player_name}} just registered.
        Age: {{age}} | Jersey: {{jersey}}
        Phone: {{phone}} | Email: {{email}}
        Role: {{role}} | T-shirt: {{tshirt}} | City: {{city}}
        Amount: ₹{{amount}} | Payment Ref: {{payment_ref}}
        Registration ID: {{registration_id}}
        Registered at: {{registered_at}}
      Set the template's "To email" field to {{to_email}}.
      Copy the "Template ID".
   4. Go to Account → General → copy your "Public Key".
   5. Paste all 4 values below.
--------------------------------------------------------------------- */
const EMAILJS_PUBLIC_KEY  = 'HAAG1uFdaMt33DEPj';
const EMAILJS_SERVICE_ID  = 'service_tz3yoya';
const EMAILJS_TEMPLATE_ID = 'template_kwpqnfu'; 
const ADMIN_EMAIL         = 'aliedit1821@gmail.com'; // where notifications should go

function emailNotificationsReady(){
  return EMAILJS_PUBLIC_KEY  && !EMAILJS_PUBLIC_KEY.startsWith('YOUR_')  &&
         EMAILJS_SERVICE_ID  && !EMAILJS_SERVICE_ID.startsWith('YOUR_')  &&
         EMAILJS_TEMPLATE_ID && !EMAILJS_TEMPLATE_ID.startsWith('YOUR_') &&
         window.emailjs;
}

if (emailNotificationsReady()) {
  emailjs.init(EMAILJS_PUBLIC_KEY);
}

function notifyAdminByEmail(entry){
  if (!emailNotificationsReady()) {
    console.warn('Email notifications are not configured yet — see the EMAILJS_* constants near the top of the script.');
    return;
  }

  const params = {
    to_email: ADMIN_EMAIL,
    registration_id: entry.id,
    player_name: (entry.firstName + ' ' + entry.lastName).trim(),
    age: entry.age,
    jersey: entry.jersey,
    phone: entry.phone,
    email: entry.email || 'Not provided',
    role: entry.role,
    tshirt: entry.tshirt,
    city: entry.city,
    amount: entry.amount,
    payment_ref: entry.paymentRef || 'Not provided',
    registered_at: entry.registeredAt
  };

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, params)
    .then(() => console.log('Admin notified by email for', entry.id))
    .catch((err) => console.error('Email notification failed:', err));
}

// ⚠️ IMPORTANT: after you deploy the Google Apps Script (Code.gs) as a
// Web App, paste its URL here. This is what makes registrations save to
// your Google Sheet instead of the browser.
const API_URL = 'https://script.google.com/macros/s/AKfycbxhXLRdU-0Ft9-KJBUkxBREQxNLPHxK8tKj6Y-wmL6mdMFRDkaGrGTmn-GzY2PeH003/exec';

const FEE = 99.18;

let allRegs = [];
let currentAdminPin = '';
window.registrationSubmitted = false;

function showView(view){
  const registerView = document.getElementById('registerView');
  const adminView = document.getElementById('adminView');
  const navRegister = document.getElementById('navRegister');
  const navAdmin = document.getElementById('navAdmin');

  if (registerView) registerView.classList.toggle('hidden', view !== 'register');
  if (adminView) adminView.classList.toggle('hidden', view !== 'admin');
  if (navRegister) navRegister.classList.toggle('active', view === 'register');
  if (navAdmin) navAdmin.classList.toggle('active', view === 'admin');

  if (view === 'admin') {
    const loginCard = document.getElementById('loginCard');
    const dashCard = document.getElementById('dashCard');

    if (loginCard && dashCard && !dashCard.classList.contains('hidden')) {
      loadRegistrations();
    }
  }
}

function setActiveStep(step){
  document.getElementById('stepDot1').classList.toggle('active', step === 1);
  document.getElementById('stepDot2').classList.toggle('active', step === 2);
  document.getElementById('stepDot3').classList.toggle('active', step === 3);
}

function refreshReview(){
  const role = document.querySelector('input[name="role"]:checked');

  document.getElementById('reviewName').textContent =
    (document.getElementById('firstName').value.trim() + ' ' +
     document.getElementById('lastName').value.trim()).trim() || '-';
  document.getElementById('reviewAge').textContent = document.getElementById('age').value || '-';
  document.getElementById('reviewJersey').textContent = document.getElementById('jersey').value || '-';
  document.getElementById('reviewPhone').textContent = document.getElementById('phone').value.trim() || '-';
  document.getElementById('reviewEmail').textContent = document.getElementById('email').value.trim() || '-';
  document.getElementById('reviewRole').textContent = role ? role.value : '-';
  document.getElementById('reviewTshirt').textContent = document.getElementById('tshirt').value || '-';
  document.getElementById('reviewCity').textContent = document.getElementById('city').value.trim() || '-';
  document.getElementById('reviewPaymentRef').textContent = document.getElementById('paymentRef').value.trim() || '-';
  document.getElementById('reviewPaymentTo').textContent = '₹' + FEE.toFixed(2) + ' → ' + UPI_ID;

  const box = document.getElementById('reviewScreenshotBox');
  box.innerHTML = '';

  const file = document.getElementById('paymentScreenshot').files[0];
  if (file) {
    const img = document.createElement('img');
    img.alt = 'Payment screenshot';
    img.src = URL.createObjectURL(file);
    box.appendChild(img);
  } else {
    box.textContent = 'No payment screenshot selected.';
  }
}

function goToStep(step){
  if (window.registrationSubmitted) return;

  if (step === 1){
    document.getElementById('cricketForm').classList.remove('hidden');
    document.getElementById('paymentView').classList.add('hidden');
    document.getElementById('successCard').classList.add('hidden');
    setActiveStep(1);
    return;
  }

  if (step === 2){
    const form = document.getElementById('cricketForm');

    if (!form.checkValidity()) {
      form.reportValidity();
      setActiveStep(1);
      return;
    }

    if (!document.getElementById('terms').checked) {
      alert('Please agree to the terms and conditions first.');
      setActiveStep(1);
      return;
    }

    document.getElementById('cricketForm').classList.add('hidden');
    document.getElementById('paymentView').classList.remove('hidden');
    document.getElementById('successCard').classList.add('hidden');
    setActiveStep(2);
    generateUpiQr();
    return;
  }

  if (step === 3){
    const form = document.getElementById('cricketForm');

    if (!form.checkValidity()) {
      form.reportValidity();
      setActiveStep(1);
      return;
    }

    if (!document.getElementById('terms').checked) {
      alert('Please agree to the terms and conditions first.');
      setActiveStep(1);
      return;
    }

    const paymentRef = document.getElementById('paymentRef').value.trim();
    const screenshot = document.getElementById('paymentScreenshot').files[0];

    if (!paymentRef) {
      alert('Please enter the transaction ID / UTR.');
      setActiveStep(2);
      return;
    }

    if (!screenshot) {
      alert('Please upload the successful payment screenshot.');
      setActiveStep(2);
      return;
    }

    refreshReview();
    document.getElementById('cricketForm').classList.add('hidden');
    document.getElementById('paymentView').classList.add('hidden');
    document.getElementById('successCard').classList.remove('hidden');
    document.getElementById('reviewPanel').classList.remove('hidden');
    document.getElementById('submittedPanel').classList.add('hidden');
    setActiveStep(3);
  }
}

function goToPayment(){
  goToStep(2);
}

function backToDetails(){
  goToStep(1);
}

function buildUpiUri(){
  const note = encodeURIComponent('Mokamo Premier League Season 2 Registration 2027');
  const pn = encodeURIComponent(UPI_PAYEE_NAME);
  const pa = encodeURIComponent(UPI_ID);
  return 'upi://pay?pa=' + pa + '&pn=' + pn + '&am=' + FEE.toFixed(2) + '&cu=INR&tn=' + note;
}

function generateUpiQr(){
  const img = document.getElementById('upiQrImg');
  const idText = document.getElementById('upiIdText');

  if (!img || !idText) return;

  const upiUri = buildUpiUri();
  const qrApiUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(upiUri);

  img.src = qrApiUrl;
  idText.textContent = UPI_ID;
}

function copyUpiId(){
  const msg = document.getElementById('upiCopiedMsg');

  const showCopied = () => {
    if (!msg) return;
    msg.style.visibility = 'visible';
    setTimeout(() => { msg.style.visibility = 'hidden'; }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(UPI_ID).then(showCopied).catch(() => {
      alert('UPI ID: ' + UPI_ID);
    });
  } else {
    alert('UPI ID: ' + UPI_ID);
  }
}

function previewPaymentScreenshot(event){
  const file = event.target.files[0];
  const box = document.getElementById('paymentScreenshotPreview');

  box.innerHTML = '';

  if (!file) {
    box.classList.add('hidden');
    return;
  }

  if (!file.type.startsWith('image/')) {
    alert('Please select an image file.');
    event.target.value = '';
    box.classList.add('hidden');
    return;
  }

  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.alt = 'Payment screenshot preview';

  box.appendChild(img);
  box.classList.remove('hidden');
}

/* ---------------------------------------------------------------------
   STORAGE LAYER — Google Sheet via Apps Script Web App
   Every registration is sent to the Apps Script backend (Code.gs),
   which appends a row to a Google Sheet and uploads the payment
   screenshot to Google Drive. This means data survives even if the
   user clears their browser, and the admin can see every registration
   from any device.
--------------------------------------------------------------------- */

function apiReady(){
  return API_URL && !API_URL.includes('PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE');
}

async function apiRequest(payload){
  if (!apiReady()) {
    throw new Error('The Google Sheet backend is not connected yet. Deploy Code.gs and paste the Web App URL into API_URL.');
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight on Apps Script
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.error || 'Server request failed.');
  }

  return data;
}

async function getAllRegs(pin){
  const data = await apiRequest({ action: 'list', pin: pin });
  return data.registrations || [];
}

async function saveRegistration(entry){
  const data = await apiRequest({ action: 'submit', registration: entry });
  return data;
}

async function verifyRegistration(id, pin){
  return await apiRequest({ action: 'verify', id: id, pin: pin });
}

function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the payment screenshot.'));
    reader.readAsDataURL(file);
  });
}

async function getFormData(){
  const role = document.querySelector('input[name="role"]:checked');
  const screenshotFile = document.getElementById('paymentScreenshot').files[0];

  return {
    id: 'REG-' + Date.now(),
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    age: document.getElementById('age').value,
    jersey: document.getElementById('jersey').value,
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    role: role ? role.value : '',
    tshirt: document.getElementById('tshirt').value,
    state: document.getElementById('state').value.trim(),
    city: document.getElementById('city').value.trim(),
    paymentRef: document.getElementById('paymentRef').value.trim(),
    paymentScreenshot: await fileToDataURL(screenshotFile),
    paymentScreenshotName: screenshotFile ? screenshotFile.name : '',
    amount: FEE,
    paid: false,
    paymentStatus: 'Pending',
    registeredAt: new Date().toISOString()
  };
}

async function submitRegistration(){
  if (window.registrationSubmitted) return;

  const paymentRef = document.getElementById('paymentRef').value.trim();
  const screenshot = document.getElementById('paymentScreenshot').files[0];

  if (!paymentRef) {
    alert('Please enter the transaction ID / UTR.');
    goToStep(2);
    return;
  }

  if (!screenshot) {
    alert('Please upload the successful payment screenshot.');
    goToStep(2);
    return;
  }

  if (!apiReady()) {
    alert('The registration server is not connected yet. Deploy Code.gs to Google Apps Script and paste the Web App URL into API_URL in the code.');
    return;
  }

  const button = document.getElementById('finalSubmitBtn');
  button.disabled = true;
  button.textContent = 'Submitting...';

  try {
    const entry = await getFormData();
    const result = await saveRegistration(entry);

    notifyAdminByEmail(entry);

    window.registrationSubmitted = true;

    document.getElementById('reviewPanel').classList.add('hidden');
    document.getElementById('submittedPanel').classList.remove('hidden');

    document.getElementById('successMsg').textContent =
      entry.firstName +
      ', your registration has been submitted for Mokamo Premier League Season 2 (2027). ' +
      'Registration ID: ' + (result.id || entry.id) +
      '. Payment is pending admin verification.';

  } catch (e) {
    console.error(e);
    alert(e.message || 'Registration could not be submitted.');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit Registration';
  }
}

async function checkPin(){
  const input = document.getElementById('adminPin');
  const loginCard = document.getElementById('loginCard');
  const dashCard = document.getElementById('dashCard');

  if (!input || !loginCard || !dashCard) return;

  const val = input.value.trim();

  if (!val) {
    alert('Enter the admin PIN.');
    return;
  }

  if (!apiReady()) {
    alert('The Google Sheet backend is not connected yet. Deploy Code.gs and paste the Web App URL into API_URL in the code.');
    return;
  }

  const button = input.closest('.login-box')?.querySelector('button');
  if (button) button.disabled = true;

  try {
    allRegs = await getAllRegs(val);
    currentAdminPin = val;

    loginCard.classList.add('hidden');
    dashCard.classList.remove('hidden');

    renderStats();
    renderTable();
  } catch (e) {
    alert(e.message || 'Wrong PIN or server error.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadRegistrations(){
  if (!apiReady()) return;

  try {
    allRegs = await getAllRegs(currentAdminPin);
    renderStats();
    renderTable();
  } catch (e) {
    console.error(e);
    alert(e.message || 'Could not load registrations.');
  }
}

function renderStats(){
  const total = allRegs.length;
  const paid = allRegs.filter(r => r.paid === true).length;
  const revenue = allRegs
    .filter(r => r.paid === true)
    .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statPaid').textContent = paid;
  document.getElementById('statRevenue').textContent = '₹' + revenue.toFixed(2);
}

function renderTable(){
  const search = document.getElementById('searchBox').value.trim().toLowerCase();
  const body = document.getElementById('regBody');

  body.innerHTML = '';

  allRegs
    .filter(r => {
      const name = ((r.firstName || '') + ' ' + (r.lastName || '')).toLowerCase();
      const phone = String(r.phone || '').toLowerCase();
      const paymentRef = String(r.paymentRef || '').toLowerCase();

      return name.includes(search) || phone.includes(search) || paymentRef.includes(search);
    })
    .forEach((r) => {
      const tr = document.createElement('tr');

      const paymentHtml = r.paid
        ? '<span class="tag paid">Paid ₹' + escapeHtml(r.amount) + '</span>'
        : '<span class="tag pending">Pending</span>';

      const actionHtml = r.paid
        ? '<button class="verify-btn" disabled>Verified</button>'
        : '<button class="verify-btn" onclick="markPaid(\'' + r.id + '\')">Verify & Mark Paid</button>';

      const screenshotHtml = r.screenshotUrl
        ? '<a class="verify-btn" href="' + escapeHtml(r.screenshotUrl) + '" target="_blank" rel="noopener">View</a>'
        : '-';

      tr.innerHTML = `
        <td>${escapeHtml(r.firstName)}</td>
        <td>${escapeHtml(r.lastName)}</td>
        <td>${escapeHtml(r.age)}</td>
        <td>${escapeHtml(r.jersey)}</td>
        <td>${escapeHtml(r.phone)}</td>
        <td>${escapeHtml(r.email)}</td>
        <td>${escapeHtml(r.role)}</td>
        <td>${escapeHtml(r.tshirt)}</td>
        <td>${escapeHtml(r.city)}</td>
        <td>${escapeHtml(r.paymentRef || '-')}</td>
        <td>${screenshotHtml}</td>
        <td>${paymentHtml}</td>
        <td>${actionHtml}</td>
      `;

      body.appendChild(tr);
    });
}

async function markPaid(id){
  const entry = allRegs.find(r => r.id === id);

  if (!entry) {
    alert('Registration not found.');
    return;
  }

  if (!confirm(
    'Verify payment reference "' + (entry.paymentRef || '-') +
    '" for ' + (entry.firstName || '') + ' ' + (entry.lastName || '') +
    ' in your UPI app / bank statement before marking it PAID.'
  )) return;

  try {
    await verifyRegistration(id, currentAdminPin);
    alert('Payment verified successfully.');
    await loadRegistrations();
  } catch (e) {
    alert(e.message || 'Could not verify payment.');
  }
}

function exportCSV(){
  const headers = [
    'ID','First','Last','Age','Jersey','Phone','Email','Role','T-Shirt',
    'State','City','PaymentRef','ScreenshotUrl','Amount','Paid','PaymentStatus',
    'RegisteredAt','VerifiedAt'
  ];

  const rows = allRegs.map(r => [
    r.id, r.firstName, r.lastName, r.age, r.jersey, r.phone, r.email,
    r.role, r.tshirt, r.state, r.city, r.paymentRef, r.screenshotUrl, r.amount,
    r.paid ? 'Yes' : 'No', r.paymentStatus, r.registeredAt, r.verifiedAt || ''
  ]);

  const csv =
    headers.join(',') + '\n' +
    rows.map(row =>
      row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = 'mpl-registrations-2027.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* Cursor/click heart effects */
let lastHeart = 0;

document.addEventListener('mousemove', function(e){
  const now = Date.now();

  if (now - lastHeart < 55) return;
  lastHeart = now;

  const h = document.createElement('div');
  h.className = 'heart-particle';
  h.textContent = '♥';
  h.style.left = e.clientX + 'px';
  h.style.top = e.clientY + 'px';
  h.style.setProperty('--dx', (Math.random() * 20 - 10) + 'px');

  document.body.appendChild(h);
  setTimeout(() => h.remove(), 900);
});

document.addEventListener('click', function(e){
  ['left', 'right'].forEach(side => {
    const h = document.createElement('div');
    h.className = 'heart-half ' + side;
    h.textContent = '♥';
    h.style.left = e.clientX + 'px';
    h.style.top = e.clientY + 'px';

    document.body.appendChild(h);
    setTimeout(() => h.remove(), 900);
  });
});

document.addEventListener('DOMContentLoaded', function(){
  generateUpiQr();
});


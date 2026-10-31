/* Rakshak Portal - frontend
 * Talks to the REST API under /api (same origin).
 * No inline scripts or handlers are used so the server can enforce a strict
 * Content-Security-Policy. Every value that comes from the server is escaped
 * (esc) before it is placed into HTML.
 */
(function () {
  'use strict';

  var API = '/api';
  var TOKEN_KEY = 'rakshak_token'; // sessionStorage: cleared when the tab closes (safe on shared computers)

  var state = {
    user: null,
    token: null,
    seq: 0,
    pollTimer: null,
    afterLogin: null,
    complaintCache: {},
    dash: { section: 'overview', firPage: 1, firStatus: '', firSearch: '', cmpPage: 1, cmpStatus: '' }
  };

  try { state.token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { state.token = null; }

  /* ---------- helpers ---------- */

  function $(id) { return document.getElementById(id); }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  var LABELS = {
    theft: 'Theft', fraud: 'Fraud', cybercrime: 'Cybercrime', assault: 'Assault', harassment: 'Harassment', others: 'Others',
    'police-misconduct': 'Police Misconduct', 'service-delay': 'Service Delay', corruption: 'Corruption', 'facility-issue': 'Facility Issue'
  };
  function label(k) { return LABELS[k] || k; }

  var STATUS_CLASS = { Pending: 'pending', Active: 'active', Closed: 'closed', Resolved: 'closed' };
  function badge(s) {
    return '<span class="status status-' + (STATUS_CLASS[s] || 'pending') + '">' + esc(s) + '</span>';
  }

  function fmtDate(v) {
    if (!v) return '—';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00') : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function todayISO() {
    return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function isStaff() { return !!state.user && (state.user.role === 'admin' || state.user.role === 'officer'); }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  var toastTimer;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 4000);
  }

  var alertTimers = {};
  function showAlert(id, message, type, ms) {
    var a = $(id);
    a.className = 'alert alert-' + type + ' show';
    a.textContent = message;
    clearTimeout(alertTimers[id]);
    alertTimers[id] = setTimeout(function () { hideAlert(id); }, ms || 6000);
  }
  function hideAlert(id) { $(id).classList.remove('show'); }

  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Please wait…'; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
    btn.disabled = busy;
  }

  /* ---------- API ---------- */

  function ApiError(message, status) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
  }
  ApiError.prototype = Object.create(Error.prototype);

  async function api(path, opts) {
    opts = opts || {};
    var headers = {};
    var auth = opts.auth !== false;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth && state.token) headers.Authorization = 'Bearer ' + state.token;

    var res;
    try {
      res = await fetch(API + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
      });
    } catch (e) {
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }

    var data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON response */ }

    if (res.status === 401 && auth && state.token && !opts.silent) {
      endSession();
      toast('Your session has ended. Please log in again.');
      showPage('home');
      openModal('loginModal');
      throw new ApiError('Session expired', 401);
    }
    if (!res.ok || (data && data.success === false)) {
      throw new ApiError((data && data.error) || 'Request failed (' + res.status + ')', res.status);
    }
    return data;
  }

  /* ---------- session ---------- */

  function startSession(token, user) {
    state.token = token;
    state.user = user;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch (e) { /* private mode */ }
    updateAuthUI();
  }

  function endSession() {
    state.token = null;
    state.user = null;
    state.complaintCache = {};
    clearInterval(state.pollTimer);
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    updateAuthUI();
  }

  function updateAuthUI() {
    var box = $('authButtons');
    box.textContent = '';
    if (state.user) {
      box.appendChild(el('span', { 'class': 'welcome' }, 'Welcome, ' + state.user.fullName));
      box.appendChild(el('button', { type: 'button', 'class': 'btn btn-secondary', 'data-action': 'logout' }, 'Logout'));
    } else {
      box.appendChild(el('a', { href: '#', 'class': 'btn btn-secondary', 'data-action': 'open-login' }, 'Login'));
      box.appendChild(el('a', { href: '#', 'class': 'btn btn-primary', 'data-action': 'open-register' }, 'Register'));
    }
    $('navMyRecords').hidden = !state.user || isStaff();
    $('navDashboard').hidden = !isStaff();
  }

  /* ---------- navigation & modals ---------- */

  var lastFocus = null;

  function openModal(id) {
    closeModals(true);
    lastFocus = document.activeElement;
    var m = $(id);
    m.classList.add('active');
    var first = m.querySelector('input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 0);
  }

  function closeModals(keepFocus) {
    document.querySelectorAll('.modal.active').forEach(function (m) { m.classList.remove('active'); });
    if (!keepFocus && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  function requireLogin(message, thenPage) {
    state.afterLogin = thenPage || null;
    openModal('loginModal');
    if (message) showAlert('loginAlert', message, 'error');
  }

  function showPage(id) {
    if (id === 'adminDashboard' && !isStaff()) { requireLogin('Please log in with a staff account.', null); return; }
    if (id === 'myRecords' && !state.user) { requireLogin('Please log in to see your records.', 'myRecords'); return; }

    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === id); });
    document.querySelectorAll('.nav-menu a').forEach(function (a) { a.classList.toggle('active', a.dataset.page === id); });
    clearInterval(state.pollTimer);
    window.scrollTo(0, 0);

    if (id === 'fir' || id === 'complaint') prefillForms();
    if (id === 'myRecords') loadMyRecords();
    if (id === 'adminDashboard') loadDashboard();
  }

  function prefillForms() {
    var u = state.user;
    $('firDate').max = todayISO();
    if (!u) return;
    var fill = function (id, v) { var n = $(id); if (n && !n.value && v) n.value = v; };
    fill('firName', u.fullName); fill('firMobile', u.mobile); fill('firEmail', u.email);
    fill('cmpName', u.fullName); fill('cmpContact', u.mobile);
  }

  /* ---------- auth forms ---------- */

  async function handleLogin(e) {
    var f = e.target;
    var btn = f.querySelector('button[type=submit]');
    hideAlert('loginAlert');
    setBusy(btn, true, 'Signing in…');
    try {
      var res = await api('/auth/login', {
        method: 'POST', auth: false,
        body: { username: f.elements.username.value.trim(), password: f.elements.password.value }
      });
      startSession(res.token, res.user);
      f.reset();
      closeModals(true);
      toast('Welcome, ' + res.user.fullName);
      var next = state.afterLogin;
      state.afterLogin = null;
      showPage(isStaff() ? 'adminDashboard' : (next || 'home'));
    } catch (err) {
      showAlert('loginAlert', err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  async function handleRegister(e) {
    var f = e.target;
    var btn = f.querySelector('button[type=submit]');
    hideAlert('registerAlert');
    if (f.elements.password.value !== f.elements.password2.value) {
      showAlert('registerAlert', 'Passwords do not match.', 'error');
      return;
    }
    setBusy(btn, true, 'Creating account…');
    try {
      await api('/auth/register', {
        method: 'POST', auth: false,
        body: {
          fullName: f.elements.fullName.value.trim(),
          username: f.elements.username.value.trim(),
          email: f.elements.email.value.trim(),
          mobile: f.elements.mobile.value.trim(),
          password: f.elements.password.value
        }
      });
      var uname = f.elements.username.value.trim();
      f.reset();
      openModal('loginModal');
      $('loginUsername').value = uname;
      showAlert('loginAlert', 'Registration successful! Please log in.', 'success');
    } catch (err) {
      showAlert('registerAlert', err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  function logout() {
    endSession();
    showPage('home');
    toast('You have been logged out.');
  }

  /* ---------- FIR / complaint submission ---------- */

  async function submitFIR(e) {
    var f = e.target;
    if (!state.user) { requireLogin('Please log in first to file an FIR.', 'fir'); showAlert('firAlert', 'Please log in first to file an FIR.', 'error'); return; }
    var btn = f.querySelector('button[type=submit]');
    var fd = new FormData(f);
    setBusy(btn, true, 'Submitting…');
    try {
      var res = await api('/firs', {
        method: 'POST',
        body: {
          complainantName: fd.get('name'), mobile: fd.get('mobile'), email: fd.get('email'),
          address: fd.get('address'), crimeType: fd.get('crimeType'), details: fd.get('details'),
          incidentDate: fd.get('incidentDate'), location: fd.get('location')
        }
      });
      showAlert('firAlert', 'FIR submitted successfully! Your FIR Number is: ' + res.data.firNumber + '. Please note it down to track your case.', 'success', 30000);
      f.reset();
      prefillForms();
    } catch (err) {
      if (err.status !== 401) showAlert('firAlert', err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  async function submitComplaint(e) {
    var f = e.target;
    if (!state.user) { requireLogin('Please log in first to lodge a complaint.', 'complaint'); showAlert('complaintAlert', 'Please log in first to lodge a complaint.', 'error'); return; }
    var btn = f.querySelector('button[type=submit]');
    var fd = new FormData(f);
    setBusy(btn, true, 'Submitting…');
    try {
      var res = await api('/complaints', {
        method: 'POST',
        body: { name: fd.get('name'), contact: fd.get('contact'), type: fd.get('type'), details: fd.get('details') }
      });
      showAlert('complaintAlert', 'Complaint submitted successfully! Your Complaint Number is: ' + res.data.complaintNumber + '. Please note it down to track it.', 'success', 30000);
      f.reset();
      prefillForms();
    } catch (err) {
      if (err.status !== 401) showAlert('complaintAlert', err.message, 'error');
    } finally {
      setBusy(btn, false);
    }
  }

  /* ---------- public tracking ---------- */

  async function trackStatus() {
    var ref = $('trackingNumber').value.trim();
    var out = $('trackingResult');
    if (!ref) { out.innerHTML = '<div class="alert alert-error show">Please enter a reference number.</div>'; return; }
    out.innerHTML = '<div class="empty-state">Searching…</div>';
    try {
      var res = await api('/track/' + encodeURIComponent(ref), { auth: false });
      var d = res.data;
      out.innerHTML =
        '<div class="service-card">' +
        '<h4>' + (res.type === 'FIR' ? 'FIR' : 'Complaint') + ' Status: ' + esc(d.reference) + '</h4>' +
        '<p><strong>Type:</strong> ' + esc(label(d.category)) + '</p>' +
        '<p><strong>Status:</strong> ' + badge(d.status) + '</p>' +
        '<p><strong>Submitted:</strong> ' + esc(fmtDate(d.submittedOn)) + '</p>' +
        '<p><strong>Last updated:</strong> ' + esc(fmtDate(d.lastUpdated)) + '</p>' +
        '</div>';
    } catch (err) {
      out.innerHTML = '<div class="alert alert-error show">' + esc(err.message) + '</div>';
    }
  }

  /* ---------- emergency SOS ---------- */

  function getPosition() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, function () { resolve(null); },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
    });
  }

  async function sendSOS() {
    if (!state.user) {
      requireLogin('Please log in so your alert can be recorded. If you are in immediate danger, call 112 now.', null);
      return;
    }
    var ok = window.confirm(
      'EMERGENCY SOS\n\nIf you are in immediate danger, call 112 now.\n\n' +
      'This sends an alert with your current location to the portal staff dashboard.\n\nSend alert?'
    );
    if (!ok) return;

    toast('Getting your location…', 8000);
    var pos = await getPosition();
    try {
      var res = await api('/emergency', {
        method: 'POST',
        body: pos ? { latitude: pos.coords.latitude, longitude: pos.coords.longitude } : {}
      });
      window.alert(
        'Emergency alert recorded.\n\nReference: ' + res.data.emergencyNumber +
        (pos ? '' : '\n\nYour location could not be read - please tell staff where you are.') +
        '\n\nThis does not replace emergency services. If you need help right now, call 112.'
      );
    } catch (err) {
      if (err.status === 401) return;
      window.alert('Could not send the alert: ' + err.message + '\n\nPlease call 112 immediately.');
    }
  }

  /* ---------- shared table helpers ---------- */

  function table(headers, rows, emptyText) {
    if (!rows.length) return '<div class="empty-state">' + esc(emptyText || 'Nothing to show yet.') + '</div>';
    return '<div class="table-container"><table><thead><tr>' +
      headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }

  function viewBtn(action, id, text) {
    return '<button type="button" class="btn btn-secondary btn-sm" data-action="' + action + '" data-id="' + esc(id) + '">' + esc(text) + '</button>';
  }

  function pager(p, target) {
    var pages = Math.max(1, p.totalPages);
    return '<div class="pager"><span>' + p.totalRecords + ' record' + (p.totalRecords === 1 ? '' : 's') +
      ' · Page ' + p.currentPage + ' of ' + pages + '</span><span>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="dash-page" data-target="' + target + '" data-dir="-1"' + (p.currentPage <= 1 ? ' disabled' : '') + '>Previous</button> ' +
      '<button type="button" class="btn btn-secondary btn-sm" data-action="dash-page" data-target="' + target + '" data-dir="1"' + (p.currentPage >= pages ? ' disabled' : '') + '>Next</button>' +
      '</span></div>';
  }

  function errorBox(err) { return '<div class="alert alert-error show">' + esc(err.message) + '</div>'; }

  function statusOptions(selected) {
    return ['Pending', 'Active', 'Closed'].map(function (s) {
      return '<option value="' + s + '"' + (s === selected ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
  }

  /* ---------- citizen: my records ---------- */

  async function loadMyRecords() {
    var box = $('myRecordsBody');
    box.innerHTML = '<div class="empty-state" style="color:#fff">Loading…</div>';
    try {
      var results = await Promise.all([api('/firs?limit=50'), api('/complaints?limit=50'), api('/notifications')]);
      var firs = results[0].data, complaints = results[1].data, notes = results[2].data;
      cacheComplaints(complaints);

      var firRows = firs.map(function (f) {
        return '<tr><td>' + esc(f.fir_number) + '</td><td>' + esc(label(f.crime_type)) + '</td><td>' + esc(fmtDate(f.incident_date)) +
          '</td><td>' + badge(f.status) + '</td><td>' + viewBtn('view-fir', f.id, 'View') + '</td></tr>';
      });
      var cmpRows = complaints.map(function (c) {
        return '<tr><td>' + esc(c.complaint_number) + '</td><td>' + esc(label(c.complaint_type)) + '</td><td>' + esc(fmtDate(c.created_at)) +
          '</td><td>' + badge(c.status) + '</td><td>' + viewBtn('view-complaint', c.id, 'View') + '</td></tr>';
      });
      var noteItems = notes.map(function (n) {
        return '<li class="' + (n.is_read ? '' : 'unread') + '"><span>' + esc(n.message) + '<small>' + esc(fmtDateTime(n.created_at)) + '</small></span>' +
          (n.is_read ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-action="read-notification" data-id="' + esc(n.id) + '">Mark read</button>') + '</li>';
      });

      box.innerHTML =
        '<section><h3>My FIRs</h3>' + table(['FIR No.', 'Type', 'Incident date', 'Status', ''], firRows, 'You have not filed any FIRs yet.') + '</section>' +
        '<section><h3>My Complaints</h3>' + table(['Complaint No.', 'Type', 'Filed on', 'Status', ''], cmpRows, 'You have not lodged any complaints yet.') + '</section>' +
        '<section><h3>Notifications</h3>' + (noteItems.length ? '<ul class="notice-list">' + noteItems.join('') + '</ul>' : '<div class="empty-state" style="color:#fff">No notifications.</div>') + '</section>';
    } catch (err) {
      if (err.status !== 401) box.innerHTML = errorBox(err);
    }
  }

  function cacheComplaints(rows) {
    rows.forEach(function (c) { state.complaintCache[c.id] = c; });
  }

  /* ---------- record detail modal ---------- */

  function dl(pairs) {
    return '<dl class="detail-grid">' + pairs.map(function (p) {
      return '<dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1] === null || p[1] === undefined || p[1] === '' ? '—' : p[1]) + '</dd>';
    }).join('') + '</dl>';
  }

  async function openFir(id) {
    openModal('detailModal');
    $('detailBody').innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      var f = (await api('/firs/' + encodeURIComponent(id))).data;
      var officers = isStaff() ? (await api('/officers')).data : [];

      var html =
        '<h3>' + esc(f.fir_number) + ' ' + badge(f.status) + '</h3>' +
        dl([
          ['Complainant', f.complainant_name], ['Mobile', f.mobile], ['Email', f.email], ['Address', f.address],
          ['Crime type', label(f.crime_type)], ['Incident date', fmtDate(f.incident_date)], ['Location', f.location],
          ['Filed on', fmtDateTime(f.created_at)], ['Last updated', fmtDateTime(f.updated_at)]
        ].concat(isStaff() ? [['Assigned officer', f.assigned_officer_name || 'Unassigned']] : [])) +
        '<h4>Incident details</h4><div class="detail-text">' + esc(f.incident_details) + '</div>' +
        '<h4>History</h4>' +
        (f.timeline.length
          ? '<ul class="timeline">' + f.timeline.map(function (t) {
              return '<li>' + esc(t.description) + '<small>' + esc(fmtDateTime(t.created_at)) + (t.updated_by_name ? ' · ' + esc(t.updated_by_name) : '') + '</small></li>';
            }).join('') + '</ul>'
          : '<p class="form-hint">No updates yet.</p>');

      if (isStaff()) {
        html +=
          '<div class="update-box"><h4>Update this FIR</h4>' +
          '<form data-form="update-fir" data-id="' + esc(f.id) + '">' +
          '<div class="form-group"><label for="updFirStatus">Status</label><select id="updFirStatus" class="form-control" name="status">' + statusOptions(f.status) + '</select></div>' +
          '<div class="form-group"><label for="updFirOfficer">Assigned officer</label><select id="updFirOfficer" class="form-control" name="assignedOfficer"><option value="">Unassigned</option>' +
          officers.map(function (o) {
            return '<option value="' + esc(o.id) + '"' + (o.id === f.assigned_officer ? ' selected' : '') + '>' + esc(o.full_name) + ' (' + esc(o.role) + ')</option>';
          }).join('') + '</select></div>' +
          '<div class="form-group"><label for="updFirNotes">Internal notes (not visible to the citizen)</label><textarea id="updFirNotes" class="form-control" name="notes" maxlength="5000">' + esc(f.notes || '') + '</textarea></div>' +
          '<button type="submit" class="btn btn-primary">Save changes</button></form>' +
          '<div id="updateAlert" class="alert" role="alert"></div></div>';
      }
      $('detailBody').innerHTML = html;
    } catch (err) {
      if (err.status !== 401) $('detailBody').innerHTML = errorBox(err);
    }
  }

  function openComplaint(id) {
    var c = state.complaintCache[id];
    if (!c) return;
    openModal('detailModal');
    var html =
      '<h3>' + esc(c.complaint_number) + ' ' + badge(c.status) + '</h3>' +
      dl([
        ['Name', c.complainant_name], ['Contact', c.contact], ['Type', label(c.complaint_type)],
        ['Filed on', fmtDateTime(c.created_at)], ['Last updated', fmtDateTime(c.updated_at)]
      ]) +
      '<h4>Details</h4><div class="detail-text">' + esc(c.details) + '</div>' +
      '<h4>Resolution</h4><div class="detail-text">' + esc(c.resolution || 'No resolution recorded yet.') + '</div>';

    if (isStaff()) {
      html +=
        '<div class="update-box"><h4>Update this complaint</h4>' +
        '<form data-form="update-complaint" data-id="' + esc(c.id) + '">' +
        '<div class="form-group"><label for="updCmpStatus">Status</label><select id="updCmpStatus" class="form-control" name="status">' + statusOptions(c.status) + '</select></div>' +
        '<div class="form-group"><label for="updCmpRes">Resolution (visible to the citizen)</label><textarea id="updCmpRes" class="form-control" name="resolution" maxlength="5000">' + esc(c.resolution || '') + '</textarea></div>' +
        '<button type="submit" class="btn btn-primary">Save changes</button></form>' +
        '<div id="updateAlert" class="alert" role="alert"></div></div>';
    }
    $('detailBody').innerHTML = html;
  }

  async function updateFir(e) {
    var f = e.target, btn = f.querySelector('button[type=submit]');
    setBusy(btn, true, 'Saving…');
    try {
      await api('/firs/' + encodeURIComponent(f.dataset.id), {
        method: 'PATCH',
        body: { status: f.elements.status.value, notes: f.elements.notes.value, assignedOfficer: f.elements.assignedOfficer.value || null }
      });
      closeModals(true);
      toast('FIR updated');
      refreshStats();
      showDashboardSection(state.dash.section);
    } catch (err) {
      if (err.status !== 401) showAlert('updateAlert', err.message, 'error');
    } finally { setBusy(btn, false); }
  }

  async function updateComplaint(e) {
    var f = e.target, btn = f.querySelector('button[type=submit]');
    setBusy(btn, true, 'Saving…');
    try {
      await api('/complaints/' + encodeURIComponent(f.dataset.id), {
        method: 'PATCH',
        body: { status: f.elements.status.value, resolution: f.elements.resolution.value }
      });
      closeModals(true);
      toast('Complaint updated');
      refreshStats();
      showDashboardSection(state.dash.section);
    } catch (err) {
      if (err.status !== 401) showAlert('updateAlert', err.message, 'error');
    } finally { setBusy(btn, false); }
  }

  /* ---------- staff dashboard ---------- */

  async function refreshStats() {
    try {
      var d = (await api('/dashboard/stats')).data;
      $('statTotalFirs').textContent = d.totalFirs;
      $('statActiveFirs').textContent = d.activeFirs;
      $('statPendingComplaints').textContent = d.pendingComplaints;
      $('statEmergency').textContent = d.emergencyAlerts;
      $('statEmergencyCard').classList.toggle('alert-card', d.emergencyAlerts > 0);
    } catch (err) { /* shown by the section itself; keep polling quiet */ }
  }

  function loadDashboard() {
    refreshStats();
    showDashboardSection(state.dash.section);
    // Keep numbers (and the alert list) fresh so SOS alerts are not missed.
    state.pollTimer = setInterval(function () {
      if (document.hidden) return;
      refreshStats();
      if (state.dash.section === 'emergency') showDashboardSection('emergency', true);
    }, 30000);
  }

  var sections = {
    async overview() {
      var res = await api('/firs?limit=10');
      var rows = res.data.map(function (f) {
        return '<tr><td>' + esc(f.fir_number) + '</td><td>' + esc(f.complainant_name) + '</td><td>' + esc(label(f.crime_type)) +
          '</td><td>' + esc(fmtDate(f.incident_date)) + '</td><td>' + badge(f.status) + '</td><td>' + viewBtn('view-fir', f.id, 'View / Update') + '</td></tr>';
      });
      return '<h3>Recent FIRs</h3>' + table(['FIR No.', 'Complainant', 'Type', 'Incident date', 'Status', 'Actions'], rows, 'No FIRs have been filed yet.');
    },

    async firs() {
      var d = state.dash;
      var q = new URLSearchParams({ page: d.firPage, limit: 15 });
      if (d.firStatus) q.set('status', d.firStatus);
      if (d.firSearch) q.set('search', d.firSearch);
      var res = await api('/firs?' + q.toString());
      var rows = res.data.map(function (f) {
        return '<tr><td>' + esc(f.fir_number) + '</td><td>' + esc(f.complainant_name) + '</td><td>' + esc(f.mobile) + '</td><td>' + esc(label(f.crime_type)) +
          '</td><td>' + badge(f.status) + '</td><td>' + esc(f.assigned_officer_name || '—') + '</td><td>' + viewBtn('view-fir', f.id, 'View / Update') + '</td></tr>';
      });
      return '<h3>FIR Management</h3>' +
        '<form class="toolbar" data-form="fir-filter">' +
        '<select class="form-control" name="status" aria-label="Filter by status"><option value="">All statuses</option>' + statusOptions(d.firStatus) + '</select>' +
        '<input class="form-control" type="search" name="search" placeholder="Search FIR no., name or location" maxlength="100" value="' + esc(d.firSearch) + '" aria-label="Search FIRs">' +
        '<button type="submit" class="btn btn-primary btn-sm">Search</button></form>' +
        table(['FIR No.', 'Complainant', 'Mobile', 'Type', 'Status', 'Officer', 'Actions'], rows, 'No FIRs match your filters.') +
        pager(res.pagination, 'firs');
    },

    async complaints() {
      var d = state.dash;
      var q = new URLSearchParams({ page: d.cmpPage, limit: 15 });
      if (d.cmpStatus) q.set('status', d.cmpStatus);
      var res = await api('/complaints?' + q.toString());
      cacheComplaints(res.data);
      var rows = res.data.map(function (c) {
        return '<tr><td>' + esc(c.complaint_number) + '</td><td>' + esc(c.complainant_name) + '</td><td>' + esc(label(c.complaint_type)) +
          '</td><td>' + badge(c.status) + '</td><td>' + esc(fmtDate(c.created_at)) + '</td><td>' + viewBtn('view-complaint', c.id, 'View / Update') + '</td></tr>';
      });
      return '<h3>Complaint Management</h3>' +
        '<form class="toolbar" data-form="complaint-filter">' +
        '<select class="form-control" name="status" aria-label="Filter by status"><option value="">All statuses</option>' + statusOptions(d.cmpStatus) + '</select>' +
        '<button type="submit" class="btn btn-primary btn-sm">Filter</button></form>' +
        table(['Complaint No.', 'Name', 'Type', 'Status', 'Date', 'Actions'], rows, 'No complaints match your filters.') +
        pager(res.pagination, 'complaints');
    },

    async emergency() {
      var res = await api('/emergency');
      var rows = res.data.map(function (a) {
        var hasLoc = a.latitude !== null && a.longitude !== null;
        var lat = Number(a.latitude).toFixed(6), lon = Number(a.longitude).toFixed(6);
        var loc = hasLoc
          ? '<a href="https://www.openstreetmap.org/?mlat=' + lat + '&amp;mlon=' + lon + '#map=17/' + lat + '/' + lon + '" target="_blank" rel="noopener noreferrer">Open map</a>'
          : 'Not shared';
        return '<tr><td>' + esc(a.alert_number) + '</td><td>' + esc(a.reporter_name) + '<br><small>' + esc(a.reporter_mobile) + '</small></td><td>' +
          esc(fmtDateTime(a.created_at)) + '</td><td>' + loc + '</td><td>' +
          (a.status === 'Active' ? '<span class="sos-active">Active</span>' : badge('Resolved')) + '</td><td>' +
          (a.status === 'Active' ? viewBtn('resolve-alert', a.id, 'Mark resolved') : esc(fmtDateTime(a.resolved_at))) + '</td></tr>';
      });
      return '<h3>Emergency Alerts</h3><p class="form-hint" style="margin-bottom:15px">This list refreshes automatically every 30 seconds.</p>' +
        table(['Alert', 'Reported by', 'Time', 'Location', 'Status', 'Action'], rows, 'No emergency alerts.');
    },

    async officers() {
      var list = (await api('/officers')).data;
      var open = list.reduce(function (n, o) { return n + o.open_cases; }, 0);
      var rows = list.map(function (o) {
        return '<tr><td>' + esc(o.full_name) + '</td><td>' + esc(o.role) + '</td><td>' + esc(o.mobile) + '</td><td>' + o.open_cases +
          '</td><td>' + esc(o.last_login ? fmtDateTime(o.last_login) : 'Never') + '</td></tr>';
      });
      return '<h3>Officer Management</h3>' +
        '<div class="services-grid" style="margin-bottom:25px">' +
        '<div class="service-card"><h4>👮 Active Staff Accounts</h4><div class="stat-number" style="color:#667eea">' + list.length + '</div><p>Officers and administrators</p></div>' +
        '<div class="service-card"><h4>📂 Open Assigned Cases</h4><div class="stat-number" style="color:#e67e22">' + open + '</div><p>Not yet closed</p></div>' +
        '</div>' + table(['Name', 'Role', 'Mobile', 'Open cases', 'Last login'], rows, 'No staff accounts.');
    },

    async analytics() {
      var d = (await api('/dashboard/analytics')).data;
      function bars(rows, fmt) {
        if (!rows.length) return '<div class="empty-state">No data yet.</div>';
        var max = Math.max.apply(null, rows.map(function (r) { return r.count; }).concat([1]));
        return rows.map(function (r) {
          return '<div class="bar-row"><span class="bar-label">' + esc(fmt(r.label)) + '</span><div class="bar-track"><div class="bar-fill" style="width:' +
            Math.round((r.count / max) * 100) + '%"></div></div><span class="bar-value">' + r.count + '</span></div>';
        }).join('');
      }
      return '<h3>Crime Analytics</h3>' +
        '<div class="services-grid" style="margin-bottom:25px">' +
        '<div class="service-card"><h4>🎯 Resolution Rate</h4><div class="stat-number" style="color:#27ae60">' + d.resolutionRate + '%</div><p>of ' + d.totalFirs + ' FIRs are closed</p></div>' +
        '</div>' +
        '<h4>FIRs by crime type</h4>' + bars(d.byType, label) +
        '<h4>FIRs by status</h4>' + bars(d.byStatus, function (s) { return s; }) +
        '<h4>FIRs filed per month (last 6 months)</h4>' + bars(d.byMonth, function (m) { return m; });
    }
  };

  async function showDashboardSection(name, quiet) {
    state.dash.section = name;
    document.querySelectorAll('.sidebar-menu a').forEach(function (a) { a.classList.toggle('active', a.dataset.section === name); });
    var box = $('dashboardContent');
    var seq = ++state.seq;
    if (!quiet) box.innerHTML = '<div class="empty-state">Loading…</div>';
    try {
      var html = await sections[name]();
      if (seq === state.seq) box.innerHTML = html;
    } catch (err) {
      if (seq === state.seq && err.status !== 401) box.innerHTML = errorBox(err);
    }
  }

  /* ---------- notifications ---------- */

  async function markRead(id, btn) {
    try {
      await api('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' });
      var li = btn.closest('li');
      if (li) li.classList.remove('unread');
      btn.remove();
    } catch (err) { if (err.status !== 401) toast(err.message); }
  }

  /* ---------- event wiring (delegation; no inline handlers) ---------- */

  var actions = {
    'open-login': function () { openModal('loginModal'); },
    'open-register': function () { openModal('registerModal'); },
    'close-modal': function () { closeModals(); },
    logout: logout,
    sos: sendSOS,
    track: trackStatus,
    'view-fir': function (t) { openFir(t.dataset.id); },
    'view-complaint': function (t) { openComplaint(t.dataset.id); },
    'read-notification': function (t) { markRead(t.dataset.id, t); },
    'resolve-alert': async function (t) {
      if (!window.confirm('Mark this emergency alert as resolved?')) return;
      try {
        await api('/emergency/' + encodeURIComponent(t.dataset.id), { method: 'PATCH', body: { status: 'Resolved' } });
        toast('Alert marked as resolved');
        refreshStats();
        showDashboardSection('emergency');
      } catch (err) { if (err.status !== 401) toast(err.message); }
    },
    'dash-page': function (t) {
      var dir = Number(t.dataset.dir);
      if (t.dataset.target === 'firs') state.dash.firPage = Math.max(1, state.dash.firPage + dir);
      else state.dash.cmpPage = Math.max(1, state.dash.cmpPage + dir);
      showDashboardSection(state.dash.section);
    }
  };

  var forms = {
    login: handleLogin,
    register: handleRegister,
    fir: submitFIR,
    complaint: submitComplaint,
    'update-fir': updateFir,
    'update-complaint': updateComplaint,
    'fir-filter': function (e) {
      state.dash.firStatus = e.target.elements.status.value;
      state.dash.firSearch = e.target.elements.search.value.trim();
      state.dash.firPage = 1;
      showDashboardSection('firs');
    },
    'complaint-filter': function (e) {
      state.dash.cmpStatus = e.target.elements.status.value;
      state.dash.cmpPage = 1;
      showDashboardSection('complaints');
    }
  };

  document.addEventListener('click', function (e) {
    if (e.target.classList && e.target.classList.contains('modal')) { closeModals(); return; } // backdrop click

    var t = e.target.closest('[data-action], [data-page], [data-section]');
    if (!t || t.disabled) return;
    e.preventDefault();

    if (t.dataset.action && actions[t.dataset.action]) actions[t.dataset.action](t, e);
    else if (t.dataset.page) showPage(t.dataset.page);
    else if (t.dataset.section) showDashboardSection(t.dataset.section);
  });

  document.addEventListener('submit', function (e) {
    var name = e.target.dataset && e.target.dataset.form;
    if (name && forms[name]) {
      e.preventDefault();
      forms[name](e);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModals();
    if (e.key === 'Enter' && e.target.id === 'trackingNumber') { e.preventDefault(); trackStatus(); }
  });

  /* ---------- start ---------- */

  async function init() {
    $('firDate').max = todayISO();
    if (state.token) {
      try {
        var me = (await api('/auth/me', { silent: true })).user;
        state.user = me;
      } catch (err) {
        if (err.status === 401 || err.status === 403) endSession();
      }
    }
    updateAuthUI();
    showPage('home');
  }

  init();
})();

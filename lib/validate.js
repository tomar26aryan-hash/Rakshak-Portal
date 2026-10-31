'use strict';
// Small, dependency-free input validators shared by the API and the CLI scripts.
// Each helper returns an error string, or null when the value is fine.

const CRIME_TYPES = ['theft', 'fraud', 'cybercrime', 'assault', 'harassment', 'others'];
const COMPLAINT_TYPES = ['police-misconduct', 'service-delay', 'corruption', 'facility-issue', 'others'];
const STATUSES = ['Pending', 'Active', 'Closed'];

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function text(v, label, { min = 1, max = 255, required = true } = {}) {
  const s = str(v);
  if (!s) return required ? `${label} is required` : null;
  if (s.length < min) return `${label} must be at least ${min} characters`;
  if (s.length > max) return `${label} must be at most ${max} characters`;
  return null;
}

function email(v, { required = true } = {}) {
  const s = str(v);
  if (!s) return required ? 'Email is required' : null;
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Please enter a valid email address';
  return null;
}

function mobile(v, label = 'Mobile number') {
  const s = str(v).replace(/[\s-]/g, '');
  if (!s) return `${label} is required`;
  if (!/^\+?[0-9]{10,15}$/.test(s)) return `${label} must be 10-15 digits (optional leading +)`;
  return null;
}

function username(v) {
  const s = str(v);
  if (!/^[A-Za-z0-9_.-]{3,30}$/.test(s)) {
    return 'Username must be 3-30 characters: letters, numbers, dot, dash or underscore';
  }
  return null;
}

function password(v) {
  if (typeof v !== 'string' || v.length < 8) return 'Password must be at least 8 characters';
  // bcrypt only uses the first 72 bytes - refuse longer input instead of silently truncating
  if (Buffer.byteLength(v, 'utf8') > 72) return 'Password is too long (max 72 bytes)';
  if (!/[A-Za-z]/.test(v) || !/[0-9]/.test(v)) return 'Password must contain at least one letter and one number';
  return null;
}

function oneOf(v, allowed, label) {
  return allowed.includes(v) ? null : `${label} must be one of: ${allowed.join(', ')}`;
}

function isoDate(v, label = 'Date', { allowFuture = false } = {}) {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${label} must be a valid date (YYYY-MM-DD)`;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return `${label} is not a valid date`;
  if (d.getUTCFullYear() < 1900) return `${label} is too far in the past`;
  if (!allowFuture) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1); // tolerate time-zone differences
    if (d > tomorrow) return `${label} cannot be in the future`;
  }
  return null;
}

// Returns the first error found in a list, or null.
const firstError = (...errors) => errors.find(Boolean) || null;

module.exports = {
  CRIME_TYPES, COMPLAINT_TYPES, STATUSES,
  str, text, email, mobile, username, password, oneOf, isoDate, firstError
};

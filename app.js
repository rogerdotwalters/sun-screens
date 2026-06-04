/**
 * Lone Star Solar Screens — app.js
 * - Savings calculator with live Chart.js update
 * - Mobile nav toggle
 * - Scroll-reveal animations
 * - Lead form validation + Cloudflare Pages Forms submission
 */

'use strict';

/* ══════════════════════════════════════════════
   UTILITY
══════════════════════════════════════════════ */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

/** Animate a number from its current displayed value to `target` */
function animateCount(el, target) {
  const current = parseInt(el.textContent.replace(/\D/g, ''), 10) || 0;
  const diff = target - current;
  const duration = 380;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Math.round(current + diff * eased);
    el.textContent = fmt(value);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* ══════════════════════════════════════════════
   CALCULATOR
══════════════════════════════════════════════ */
(function initCalculator() {
  // DOM refs — inputs
  const billSlider    = $('#monthly-bill');
  const windowsSlider = $('#sun-windows');
  const efficiencySelect = $('#screen-efficiency');

  const billDisplay    = $('#bill-display');
  const windowsDisplay = $('#windows-display');

  // ── Constants (not user-adjustable) ──
  // Based on avg East Texas residential usage data
  const AC_FRACTION  = 0.55; // AC share of total electric bill
  const WINDOW_FACTOR = 0.35; // portion of AC load attributable to window solar gain

  // Output elements
  const monthlySavingsEl = $('#monthly-savings');
  const annualSavingsEl  = $('#annual-savings');
  const fiveSavingsEl    = $('#five-savings');

  // Chart
  let chart = null;

  /**
   * East Texas seasonal AC load factors by calendar month (Jan=0 … Dec=11).
   * Derived from EIA residential cooling-degree-day data for Tyler, TX.
   * Summer (Jun–Sep) dominates; winter months near zero.
   * Values are relative weights — they are normalised internally so the
   * annual average always equals 1.0, keeping dollar totals consistent.
   */
  const SEASONAL_WEIGHTS = [
    0.10, // Jan
    0.12, // Feb
    0.22, // Mar
    0.45, // Apr
    0.80, // May
    1.30, // Jun
    1.60, // Jul  ← peak
    1.55, // Aug
    1.20, // Sep
    0.65, // Oct
    0.28, // Nov
    0.13, // Dec
  ];
  // Normalise so the 12-month average = 1.0
  const _weightSum = SEASONAL_WEIGHTS.reduce((a, b) => a + b, 0);
  const NORM_WEIGHTS = SEASONAL_WEIGHTS.map(w => w / (_weightSum / 12));

  /** Build the month-by-month cumulative savings array (seasonal) */
  function calcSavings() {
    const bill        = parseFloat(billSlider.value);
    const windows     = parseInt(windowsSlider.value, 10);
    const efficiency  = parseFloat(efficiencySelect.value) / 100; // 0.80 or 0.90

    // Window multiplier: more windows → higher relative savings, capped
    const windowMultiplier = Math.min(1 + (windows - 4) * 0.025, 1.45);

    // Base monthly savings at average AC load (peak-summer equivalent)
    const baseMonthly = bill * AC_FRACTION * WINDOW_FACTOR * efficiency * windowMultiplier;

    // Annual savings = sum of 12 seasonally-weighted months
    // Because NORM_WEIGHTS averages to 1.0, the annual total equals baseMonthly × 12
    const annual = NORM_WEIGHTS.reduce((sum, w) => sum + baseMonthly * w, 0);

    // Displayed "monthly savings" = true average month (annual / 12)
    const monthly = annual / 12;

    // Build cumulative savings month-by-month for 60 months (5 years).
    // Start the series in June so the chart opens into peak summer — the
    // most dramatic and persuasive first impression.
    const START_MONTH = 5; // 0-indexed June
    const RATE_ESCALATION = 1.03; // 3% annual utility rate increase

    const cumulative = [0]; // index 0 = installation day
    let total = 0;
    for (let m = 0; m < 60; m++) {
      const calendarMonth = (START_MONTH + m) % 12;
      const yearIndex     = Math.floor(m / 12);
      const saving        = baseMonthly * NORM_WEIGHTS[calendarMonth] * Math.pow(RATE_ESCALATION, yearIndex);
      total += saving;
      cumulative.push(total);
    }

    return { monthly, annual, fiveYear: total, cumulative };
  }

  /** Update the slider's fill track percentage via CSS custom property */
  function updateTrack(slider) {
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const val = parseFloat(slider.value);
    const pct = ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--pct', pct + '%');
  }

  /** Refresh all display labels */
  function updateLabels() {
    const bill    = parseFloat(billSlider.value);
    const windows = parseInt(windowsSlider.value, 10);

    billDisplay.textContent    = '$' + bill;
    windowsDisplay.textContent = windows + ' window' + (windows === 1 ? '' : 's');

    [billSlider, windowsSlider].forEach(updateTrack);
  }

  /** Init or update the Chart.js line chart */
  function updateChart(cumulative) {
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const START_MONTH = 5; // June — matches calcSavings
    const labels = Array.from({ length: 61 }, (_, i) => {
      if (i === 0) return 'Now';
      const calMonth = (START_MONTH + i - 1) % 12;
      if (i % 12 === 0) return 'Yr ' + (i / 12);
      if (calMonth === 6) return 'Jul'; // mark each July peak
      return '';
    });

    const cssVars = getComputedStyle(document.documentElement);
    const terra   = cssVars.getPropertyValue('--clr-terra').trim()   || '#b94a1a';
    const amber   = cssVars.getPropertyValue('--clr-amber').trim()   || '#f5b942';
    const cream   = cssVars.getPropertyValue('--clr-cream').trim()   || '#fdf6ec';
    const muted   = cssVars.getPropertyValue('--clr-muted').trim()   || '#6b5e4e';

    const ctx = $('#savings-chart');

    if (!chart) {
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Cumulative Savings',
            data: cumulative,
            borderColor: terra,
            backgroundColor: (context) => {
              const { chart: c } = context;
              const { ctx: canvasCtx, chartArea } = c;
              if (!chartArea) return 'transparent';
              const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
              gradient.addColorStop(0, terra + '55');
              gradient.addColorStop(1, terra + '00');
              return gradient;
            },
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: (ctx) => {
              const i = ctx.dataIndex;
              return (i % 12 === 0 && i > 0) ? 5 : 0;
            },
            pointHoverRadius: 6,
            pointBackgroundColor: '#fff',
            pointBorderColor: terra,
            pointBorderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500, easing: 'easeOutCubic' },
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#fff',
              titleColor: terra,
              bodyColor: muted,
              borderColor: '#e8d9c5',
              borderWidth: 1,
              padding: 12,
              callbacks: {
                title: (items) => {
                  const i = items[0].dataIndex;
                  if (i === 0) return 'Installation day';
                  const calMonth = (START_MONTH + i - 1) % 12;
                  const yr = Math.floor((START_MONTH + i - 1) / 12) + 1;
                  return `${MONTH_NAMES[calMonth]} — Year ${yr}`;
                },
                label: (item) => ' Total saved: ' + fmt(item.raw),
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                color: muted,
                font: { size: 11 },
                maxRotation: 0,
                callback: (_, i) => labels[i] || null,
              }
            },
            y: {
              grid: { color: '#f0e6d8', lineWidth: 1 },
              ticks: {
                color: muted,
                font: { size: 11 },
                callback: (v) => '$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v),
              }
            }
          }
        }
      });
    } else {
      chart.data.datasets[0].data = cumulative;
      chart.update();
    }
  }

  /** Master update function */
  function update() {
    updateLabels();
    const { monthly, annual, fiveYear, cumulative } = calcSavings();

    animateCount(monthlySavingsEl, monthly);
    animateCount(annualSavingsEl, annual);
    animateCount(fiveSavingsEl, fiveYear);

    // Pulse cards
    [monthlySavingsEl, annualSavingsEl, fiveSavingsEl].forEach(el => {
      el.style.transform = 'scale(1.06)';
      setTimeout(() => { el.style.transform = ''; }, 200);
    });

    if (typeof Chart !== 'undefined') {
      updateChart(cumulative);
    }
  }

  // Wait for Chart.js to load then init
  function waitForChart(cb) {
    if (typeof Chart !== 'undefined') { cb(); return; }
    const obs = new MutationObserver(() => {
      if (typeof Chart !== 'undefined') { obs.disconnect(); cb(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    // Fallback poll
    const t = setInterval(() => {
      if (typeof Chart !== 'undefined') { clearInterval(t); cb(); }
    }, 100);
  }

  // Attach listeners
  [billSlider, windowsSlider].forEach(s => {
    s.addEventListener('input', update);
  });
  efficiencySelect.addEventListener('change', update);

  // Init
  updateLabels();
  waitForChart(update);
})();

/* ══════════════════════════════════════════════
   MOBILE NAV
══════════════════════════════════════════════ */
(function initMobileNav() {
  const toggle = $('.menu-toggle');
  const nav    = $('#mobile-nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    nav.hidden = expanded;
  });

  // Close on link click
  $$('a', nav).forEach(link => {
    link.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      nav.hidden = true;
    });
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !nav.contains(e.target)) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.hidden = true;
    }
  });
})();

/* ══════════════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════════════ */
(function initReveal() {
  const targets = $$('.benefit-card, .testimonial, .stat, .savings-card, .contact-copy, .lead-form');
  targets.forEach(el => el.classList.add('reveal'));

  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('visible'));
    return;
  }

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger siblings within the same parent
        const siblings = $$('.reveal', entry.target.parentElement);
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, idx * 80);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  targets.forEach(el => obs.observe(el));
})();

/* ══════════════════════════════════════════════
   LEAD FORM — validation + Cloudflare Pages Forms
══════════════════════════════════════════════ */
(function initForm() {
  const form       = $('.lead-form');
  if (!form) return;

  const submitBtn  = $('.btn-submit', form);
  const btnText    = $('.btn-text', submitBtn);
  const btnLoading = $('.btn-loading', submitBtn);
  const successEl  = $('.form-success', form);

  const validators = {
    firstName: (v) => v.trim().length >= 2 ? '' : 'Please enter your first name.',
    lastName:  (v) => v.trim().length >= 2 ? '' : 'Please enter your last name.',
    email:     (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? '' : 'Please enter a valid email address.',
    city:      (v) => v.trim().length >= 2 ? '' : 'Please enter your city.',
  };

  function validateField(input) {
    const name = input.name;
    const errEl = input.parentElement.querySelector('.field-error');
    if (!validators[name]) return true;
    const msg = validators[name](input.value);
    if (errEl) errEl.textContent = msg;
    input.classList.toggle('invalid', !!msg);
    return !msg;
  }

  // Real-time validation on blur
  $$('input, textarea', form).forEach(input => {
    input.addEventListener('blur', () => validateField(input));
    input.addEventListener('input', () => {
      if (input.classList.contains('invalid')) validateField(input);
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validate all required fields
    const required = $$('input[required], textarea[required]', form);
    const allValid = required.map(validateField).every(Boolean);
    if (!allValid) {
      const firstError = form.querySelector('.invalid');
      firstError?.focus();
      return;
    }

    // Loading state
    submitBtn.disabled = true;
    btnText.hidden     = true;
    btnLoading.hidden  = false;

    try {
      const data = new FormData(form);

      // Attach calculator values for CRM context
      data.append('estimatedMonthlySavings', $('#monthly-savings')?.textContent || '');
      data.append('estimatedAnnualSavings',  $('#annual-savings')?.textContent  || '');
      data.append('monthlyBill',             $('#monthly-bill')?.value          || '');
      data.append('sunWindows',              $('#sun-windows')?.value           || '');

      const response = await fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { 'Accept': 'application/json' },
      });

      if (response.ok) {
        // Hide form fields, show success
        $$('.form-row, .form-field, .btn-submit, .form-privacy', form).forEach(el => {
          el.style.display = 'none';
        });
        successEl.hidden = false;
        successEl.focus();
      } else {
        throw new Error('Server error');
      }
    } catch {
      // Fallback: surface an error but don't lose the form
      submitBtn.disabled = false;
      btnText.hidden     = false;
      btnLoading.hidden  = true;
      alert('Something went wrong. Please call us at (903) 555-0192 or try again.');
    }
  });
})();

/* ══════════════════════════════════════════════
   FOOTER YEAR
══════════════════════════════════════════════ */
(function setFooterYear() {
  const el = $('#footer-year');
  if (el) el.textContent = new Date().getFullYear();
})();

/* ══════════════════════════════════════════════
   SMOOTH HEADER SHADOW ON SCROLL
══════════════════════════════════════════════ */
(function headerScroll() {
  const header = $('.site-header');
  if (!header) return;
  window.addEventListener('scroll', () => {
    header.style.boxShadow = window.scrollY > 8
      ? '0 2px 20px rgba(28,26,23,.12)'
      : 'none';
  }, { passive: true });
})();

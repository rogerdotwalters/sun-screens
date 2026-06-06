/**
 * Cloudflare Pages Function — /api/contact
 * File location: functions/api/contact.js
 *
 * Handles the lead-gen form POST from index.html.
 * Sends an email notification via MailChannels (free with Cloudflare Pages,
 * no API key required — just add a SPF/DKIM DNS record for your domain).
 *
 * Environment variables to set in the Cloudflare Pages dashboard
 * (Settings → Environment Variables):
 *   NOTIFY_EMAIL   — where to receive lead emails, e.g. hello@lonestarsolarscreens.com
 *   FROM_EMAIL     — verified sender address,     e.g. noreply@lonestarsolarscreens.com
 *   FROM_NAME      — display name,                e.g. Lone Star Solar Screens Website
 *
 * Docs:
 *   https://developers.cloudflare.com/pages/functions/
 *   https://developers.cloudflare.com/pages/functions/api-reference/
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── CORS headers (same-origin only in production) ──
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*', // tighten to your domain in production
  };

  try {
    // ── Parse form data ──
    const contentType = request.headers.get('content-type') || '';
    let fields = {};

    if (contentType.includes('application/x-www-form-urlencoded') ||
        contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        fields[key] = value;
      }
    } else if (contentType.includes('application/json')) {
      fields = await request.json();
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unsupported content type' }),
        { status: 415, headers }
      );
    }

    // ── Honeypot check ──

    if (fields['_gotcha'] && fields['_gotcha'].length > 0) {
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

    // ── Basic server-side validation ──
    const required = ['firstName', 'lastName', 'email', 'city'];
    const missing  = required.filter(k => !fields[k]?.trim());
    if (missing.length) {
      return new Response(
        JSON.stringify({ ok: false, error: `Missing fields: ${missing.join(', ')}` }),
        { status: 400, headers }
      );
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(fields.email.trim())) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid email address' }),
        { status: 400, headers }
      );
    }

    // ── Build notification email ──
    const toEmail   = env.NOTIFY_EMAIL || 'contact@easttexassunscreens.com';
    const fromEmail = env.FROM_EMAIL   || 'contact@easttexassunscreens.com';
    const fromName  = env.FROM_NAME    || 'East Texas Sun Screens';

    const subject = `New Quote Request — ${fields.firstName} ${fields.lastName} (${fields.city})`;

    const textBody = [
      'New quote request from easttexassunscreens.com',
      '─'.repeat(48),
      `Name:          ${fields.firstName} ${fields.lastName}`,
      `Email:         ${fields.email}`,
      `Phone:         ${fields.phone        || 'Not provided'}`,
      `City:          ${fields.city}`,
      `Windows:       ${fields.windowCount  || 'Not provided'}`,
      `Message:       ${fields.message      || 'None'}`,
      '',
      '── Calculator values at time of submission ──',
      `Monthly bill:  ${fields.monthlyBill  || '—'}`,
      `Sun windows:   ${fields.sunWindows   || '—'}`,
      `Est. monthly:  ${fields.estimatedMonthlySavings || '—'}`,
      `Est. annual:   ${fields.estimatedAnnualSavings  || '—'}`,
      '',
      'Reply directly to this email to contact the lead.',
    ].join('\n');

    const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><style>
  body { font-family: system-ui, sans-serif; color: #1c1a17; background: #fff; margin: 0; padding: 0; }
  .wrap { max-width: 560px; margin: 32px auto; border: 1px solid #e8d9c5; border-radius: 10px; overflow: hidden; }
  .hdr  { background: #b94a1a; color: #fff; padding: 24px 32px; }
  .hdr h1 { margin: 0; font-size: 1.1rem; font-weight: 700; }
  .hdr p  { margin: 4px 0 0; font-size: .85rem; opacity: .8; }
  .body { padding: 32px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  td { padding: 8px 0; vertical-align: top; font-size: .9rem; }
  td:first-child { color: #6b5e4e; width: 140px; font-weight: 500; }
  .divider { border: none; border-top: 1px solid #e8d9c5; margin: 20px 0; }
  .section-label { font-size: .75rem; letter-spacing: .1em; text-transform: uppercase;
                   color: #b94a1a; font-weight: 600; margin-bottom: 12px; }
  .cta { display: inline-block; background: #b94a1a; color: #fff; padding: 12px 24px;
         border-radius: 8px; text-decoration: none; font-weight: 600; font-size: .9rem; }
</style></head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>☀ New Quote Request</h1>
    <p>Submitted via easttexassunscreens.com</p>
  </div>
  <div class="body">
    <p class="section-label">Contact Details</p>
    <table>
      <tr><td>Name</td><td>${esc(fields.firstName)} ${esc(fields.lastName)}</td></tr>
      <tr><td>Email</td><td><a href="mailto:${esc(fields.email)}">${esc(fields.email)}</a></td></tr>
      <tr><td>Phone</td><td>${esc(fields.phone || 'Not provided')}</td></tr>
      <tr><td>City</td><td>${esc(fields.city)}</td></tr>
      <tr><td>Windows</td><td>${esc(fields.windowCount || 'Not provided')}</td></tr>
    </table>
    ${fields.message ? `
    <p class="section-label">Message</p>
    <p style="font-size:.9rem;color:#3d2f22;background:#fdf6ec;padding:12px 16px;border-radius:6px;margin:0 0 24px;">
      ${esc(fields.message)}
    </p>` : ''}
    <hr class="divider" />
    <p class="section-label">Calculator Values at Submission</p>
    <table>
      <tr><td>Monthly bill</td><td>${esc(fields.monthlyBill || '—')}</td></tr>
      <tr><td>Sun windows</td><td>${esc(fields.sunWindows  || '—')}</td></tr>
      <tr><td>Est. monthly savings</td><td><strong>${esc(fields.estimatedMonthlySavings || '—')}</strong></td></tr>
      <tr><td>Est. annual savings</td><td><strong>${esc(fields.estimatedAnnualSavings  || '—')}</strong></td></tr>
    </table>
    <hr class="divider" />
    <a class="cta" href="mailto:${esc(fields.email)}">Reply to ${esc(fields.firstName)}</a>
  </div>
</div>
</body></html>`;

    // ── Send via MailChannels (no API key needed on Cloudflare Pages) ──
/*     const mailRes = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: toEmail }],
          // Let the lead reply directly back to the submitter
          reply_to: { email: fields.email.trim(), name: `${fields.firstName} ${fields.lastName}` },
        }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: textBody },
          { type: 'text/html',  value: htmlBody },
        ],
      }),
    });
*/
    const mailRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + env.CF_ACCOUNT_ID + '/email/routing/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_EMAIL_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: {
          email: fromEmail,
          name: fromName,
        },
        to: [
          {
            email: toEmail,
          }
        ],
        reply_to: {
          email: fields.email.trim(),
          name: `${fields.firstName} ${fields.lastName}`,
        },
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!mailRes.ok && mailRes.status !== 202) {
      const detail = await mailRes.text();
      console.error('MailChannels error:', mailRes.status, detail);
      // Still return 200 to the user — log the failure server-side
      // so the lead isn't lost, but the form shows success.
      // In production you'd also write to KV or D1 as a backup.
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (err) {
    console.error('Contact function error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'Internal server error' }),
      { status: 500, headers }
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/** Escape HTML special characters to prevent XSS in the email template */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

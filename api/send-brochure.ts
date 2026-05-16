// Vercel Serverless Function: /api/send-brochure
//
// Receives the Hero brochure-request form, sends two emails via Resend:
//   1) To the visitor with the VAY brochure PDF attached
//   2) To info@vayaccess.com notifying the team
//
// Required Vercel env var:
//   RESEND_API_KEY  — get one at https://resend.com/api-keys
//
// Optional env vars:
//   BROCHURE_FROM_EMAIL  — defaults to onboarding@resend.dev (Resend's shared
//                         sandbox sender). Replace with an address on a
//                         verified domain (e.g. brochure@vayaccess.com) once
//                         vayaccess.com is verified in Resend.
//   BROCHURE_TEAM_EMAIL  — defaults to info@vayaccess.com.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Body = {
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
};

const TEAM_EMAIL = process.env.BROCHURE_TEAM_EMAIL || 'info@vayaccess.com';
const FROM_EMAIL = process.env.BROCHURE_FROM_EMAIL || 'VayAccess <onboarding@resend.dev>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY is not configured on the server' });
  }

  const { name, email, phone, city } = (req.body || {}) as Body;
  if (!name || !email || !phone || !city) {
    return res.status(400).json({ ok: false, error: 'name, email, phone and city are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address' });
  }

  // Read the PDF brochure from the public/ folder bundled into the deployment.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = readFileSync(join(process.cwd(), 'public', 'vay-gate-brochure.pdf'));
  } catch (err) {
    console.error('Failed to read brochure PDF:', err);
    return res.status(500).json({ ok: false, error: 'Brochure PDF not found on server' });
  }

  const resend = new Resend(apiKey);
  const submittedAt = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const visitorHtml = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #1e40af; margin: 0 0 16px;">Your VAY Access Control Systems Brochure</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thanks for your interest in VayAccess Control Systems! Your brochure is attached to this email.</p>
      <p>Our product range includes:</p>
      <ul style="line-height: 1.7;">
        <li>Smart Parking &amp; Access Control Systems</li>
        <li>Barrier Gates, Turnstiles, Pedestrian Gates</li>
        <li>ANPR / License Plate Recognition</li>
        <li>Biometric &amp; RFID Access</li>
        <li>Cloud Platform &amp; Analytics</li>
      </ul>
      <p>One of our specialists will reach out shortly to understand your requirements and share customized recommendations.</p>
      <hr style="border:none; border-top:1px solid #e5e7eb; margin: 24px 0;" />
      <p style="margin: 4px 0;"><strong>Get in touch</strong></p>
      <p style="margin: 4px 0;">Phone: +91 720 724 4344</p>
      <p style="margin: 4px 0;">WhatsApp: +91 9154703116</p>
      <p style="margin: 4px 0;">Email: <a href="mailto:info@vayaccess.com">info@vayaccess.com</a></p>
      <p style="margin: 4px 0;">Web: <a href="https://vayaccess.com">vayaccess.com</a></p>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
        VayAccess Control Systems · Plot No. 26, Road No. 1, West Gandhi Nagar,
        Rampally X Road, Nagaram, Keesara (M), Hyderabad - 500083, Telangana, India
      </p>
    </div>
  `;

  const teamHtml = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
      <h2 style="color: #1e40af; margin: 0 0 12px;">New Brochure Download</h2>
      <p><strong>${escapeHtml(name)}</strong> from <strong>${escapeHtml(city)}</strong> just downloaded the VAY brochure.</p>
      <table style="border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 4px 12px 4px 0; color:#6b7280;">Name</td><td style="padding: 4px 0;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#6b7280;">Email</td><td style="padding: 4px 0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#6b7280;">Phone</td><td style="padding: 4px 0;">${escapeHtml(phone)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#6b7280;">City</td><td style="padding: 4px 0;">${escapeHtml(city)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0; color:#6b7280;">Time</td><td style="padding: 4px 0;">${submittedAt}</td></tr>
      </table>
      <p style="color:#6b7280; font-size: 13px;">Please follow up within 2 hours during business hours.</p>
    </div>
  `;

  const attachments = [
    {
      filename: 'VAY-Access-Control-Brochure.pdf',
      content: pdfBuffer,
    },
  ];

  try {
    const [visitorResult, teamResult] = await Promise.all([
      resend.emails.send({
        from: FROM_EMAIL,
        to: [email],
        replyTo: TEAM_EMAIL,
        subject: 'Your VAY Access Control Systems Brochure',
        html: visitorHtml,
        attachments,
      }),
      resend.emails.send({
        from: FROM_EMAIL,
        to: [TEAM_EMAIL],
        replyTo: email,
        subject: `New Brochure Download — ${name} (${city})`,
        html: teamHtml,
        attachments,
      }),
    ]);

    if (visitorResult.error || teamResult.error) {
      console.error('Resend error', { visitor: visitorResult.error, team: teamResult.error });
      return res.status(502).json({
        ok: false,
        error: visitorResult.error?.message || teamResult.error?.message || 'Email service rejected the send',
      });
    }

    return res.status(200).json({ ok: true, visitorId: visitorResult.data?.id, teamId: teamResult.data?.id });
  } catch (err: any) {
    console.error('send-brochure error', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Unknown error' });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

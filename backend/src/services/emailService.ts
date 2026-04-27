import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || '');
const FROM_EMAIL = process.env.FROM_EMAIL || 'VTB <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL ||
  'https://vtb-frontend-git-main-javier-picazo-trigueros-projects.vercel.app';

const isConfigured = (): boolean => {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.startsWith('re_'));
};

export const emailService = {

  async sendRegistrationReceived(to: string, fullName: string): Promise<void> {
    if (!isConfigured()) {
      console.log(`[EMAIL SKIP] Registration received → ${to} (RESEND_API_KEY not set)`);
      return;
    }
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'VTB — Your registration request has been received',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <div style="background:#1E3A5F;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">VTB</h1>
            <p style="color:#93C5FD;margin:8px 0 0;">Vote Through Blockchain</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1E3A5F;">Hi ${fullName},</h2>
            <p style="color:#475569;">Your registration request has been received and is
            currently <strong>under review</strong> by an administrator.</p>
            <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:16px;margin:24px 0;">
              <p style="color:#92400E;margin:0;">⏳ <strong>Pending review</strong> — You will
              receive an email once your request has been processed.</p>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="color:#94A3B8;font-size:12px;text-align:center;">
              VTB — Vote Through Blockchain
            </p>
          </div>
        </div>
      `
    });
  },

  async sendRegistrationApproved(
    to: string, fullName: string, tempPassword: string
  ): Promise<void> {
    if (!isConfigured()) {
      console.log(`[EMAIL SKIP] Approved → ${to} (RESEND_API_KEY not set)`);
      return;
    }
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'VTB — Your account has been approved!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <div style="background:#1E3A5F;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">VTB</h1>
            <p style="color:#93C5FD;margin:8px 0 0;">Vote Through Blockchain</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1E3A5F;">Welcome, ${fullName}!</h2>
            <p style="color:#475569;">Your account has been <strong>approved</strong>.
            You can now log in to VTB and participate in elections.</p>
            <div style="background:#D1FAE5;border:1px solid #10B981;border-radius:8px;padding:16px;margin:24px 0;">
              <p style="color:#065F46;margin:0 0 8px;"><strong>✅ Account approved</strong></p>
              <p style="color:#065F46;margin:0;">Email: <strong>${to}</strong></p>
              <p style="color:#065F46;margin:8px 0 0;">Temporary password:
                <strong style="font-family:monospace;background:#fff;padding:4px 8px;border-radius:4px;">
                  ${tempPassword}
                </strong>
              </p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${APP_URL}/login"
                 style="background:#1E3A5F;color:#fff;padding:14px 32px;border-radius:8px;
                        text-decoration:none;font-weight:bold;font-size:16px;">
                Log in to VTB →
              </a>
            </div>
            <p style="color:#EF4444;font-size:13px;">
              ⚠️ Please change your password after your first login.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="color:#94A3B8;font-size:12px;text-align:center;">
              VTB — Vote Through Blockchain
            </p>
          </div>
        </div>
      `
    });
  },

  async sendRegistrationRejected(
    to: string, fullName: string, reason: string
  ): Promise<void> {
    if (!isConfigured()) {
      console.log(`[EMAIL SKIP] Rejected → ${to} (RESEND_API_KEY not set)`);
      return;
    }
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: 'VTB — Registration request update',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <div style="background:#1E3A5F;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">VTB</h1>
            <p style="color:#93C5FD;margin:8px 0 0;">Vote Through Blockchain</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1E3A5F;">Hi ${fullName},</h2>
            <p style="color:#475569;">Unfortunately, your registration request has been
            <strong>rejected</strong>.</p>
            <div style="background:#FEE2E2;border:1px solid #EF4444;border-radius:8px;padding:16px;margin:24px 0;">
              <p style="color:#991B1B;margin:0;"><strong>❌ Reason:</strong> ${reason}</p>
            </div>
            <p style="color:#475569;">If you believe this is a mistake, please contact
            your institution administrator.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="color:#94A3B8;font-size:12px;text-align:center;">
              VTB — Vote Through Blockchain
            </p>
          </div>
        </div>
      `
    });
  },

  async sendAdminNewRequest(
    adminEmail: string, userFullName: string,
    userEmail: string, studentId: string
  ): Promise<void> {
    if (!isConfigured()) {
      console.log(`[EMAIL SKIP] Admin notify → ${adminEmail} (RESEND_API_KEY not set)`);
      return;
    }
    await resend.emails.send({
      from: FROM_EMAIL,
      to: adminEmail,
      subject: `VTB — New registration request from ${userEmail}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <div style="background:#1E3A5F;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">VTB Admin</h1>
            <p style="color:#93C5FD;margin:8px 0 0;">New Registration Request</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1E3A5F;">New request pending review</h2>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
              <tr style="border-bottom:1px solid #e2e8f0;">
                <td style="padding:10px;color:#64748B;font-weight:bold;">Name</td>
                <td style="padding:10px;color:#1E293B;">${userFullName}</td>
              </tr>
              <tr style="border-bottom:1px solid #e2e8f0;background:#f1f5f9;">
                <td style="padding:10px;color:#64748B;font-weight:bold;">Email</td>
                <td style="padding:10px;color:#1E293B;">${userEmail}</td>
              </tr>
              <tr>
                <td style="padding:10px;color:#64748B;font-weight:bold;">Student ID</td>
                <td style="padding:10px;color:#1E293B;">${studentId}</td>
              </tr>
            </table>
            <div style="text-align:center;margin:32px 0;">
              <a href="${APP_URL}/login"
                 style="background:#10B981;color:#fff;padding:14px 32px;border-radius:8px;
                        text-decoration:none;font-weight:bold;font-size:16px;">
                Review in Admin Panel →
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="color:#94A3B8;font-size:12px;text-align:center;">
              VTB — Vote Through Blockchain
            </p>
          </div>
        </div>
      `
    });
  },

  async sendElectionReminder(
    to: string, userName: string,
    electionName: string, endDate: string
  ): Promise<void> {
    if (!isConfigured()) {
      console.log(`[EMAIL SKIP] Reminder → ${to} (RESEND_API_KEY not set)`);
      return;
    }
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `VTB — Don't forget to vote: ${electionName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;">
          <div style="background:#1E3A5F;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:28px;">VTB</h1>
            <p style="color:#93C5FD;margin:8px 0 0;">Vote Through Blockchain</p>
          </div>
          <div style="background:#f8fafc;padding:32px;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;">
            <h2 style="color:#1E3A5F;">Hi ${userName}, your vote matters!</h2>
            <p style="color:#475569;">The election <strong>${electionName}</strong>
            is still open. Make sure to cast your vote before it closes.</p>
            <div style="background:#EFF6FF;border:1px solid #3B82F6;border-radius:8px;
                        padding:16px;margin:24px 0;">
              <p style="color:#1E40AF;margin:0;">🗓️ <strong>Closes on:</strong> ${endDate}</p>
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${APP_URL}/dashboard"
                 style="background:#10B981;color:#fff;padding:14px 32px;border-radius:8px;
                        text-decoration:none;font-weight:bold;font-size:16px;">
                Vote Now →
              </a>
            </div>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="color:#94A3B8;font-size:12px;text-align:center;">
              VTB — Vote Through Blockchain · You are receiving this because
              you are registered as a voter.
            </p>
          </div>
        </div>
      `
    });
  },
};

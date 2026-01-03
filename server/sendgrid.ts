// SendGrid Email Integration for LeagueVault
import sgMail from '@sendgrid/mail';

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

export async function sendEmail(to: string, subject: string, textContent: string, htmlContent?: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { apiKey, email: fromEmail } = await getCredentials();
    sgMail.setApiKey(apiKey);

    const msg = {
      to,
      from: fromEmail,
      subject,
      text: textContent,
      html: htmlContent || textContent.replace(/\n/g, '<br>'),
    };

    const [response] = await sgMail.send(msg);
    
    return { 
      success: true, 
      messageId: response.headers['x-message-id'] as string 
    };
  } catch (error: any) {
    console.error('SendGrid error:', error?.response?.body || error);
    return { 
      success: false, 
      error: error?.response?.body?.errors?.[0]?.message || error.message || 'Failed to send email' 
    };
  }
}

export async function sendInviteEmail(to: string, leagueName: string, paymentUrl: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `You're invited to ${leagueName} on LeagueVault!`;
  
  const textContent = `You've been invited to pay your dues for ${leagueName} on LeagueVault!

Click here to pay your dues now:
${paymentUrl}

Thanks,
LeagueVault Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">You're invited to ${leagueName}!</h2>
      <p>You've been invited to pay your dues for <strong>${leagueName}</strong> on LeagueVault.</p>
      <p style="margin: 24px 0;">
        <a href="${paymentUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Pay Your Dues Now
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${paymentUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;">LeagueVault - Fantasy Sports Payment Management</p>
    </div>
  `;

  return sendEmail(to, subject, textContent, htmlContent);
}

export async function sendReminderEmail(to: string, leagueName: string, paymentUrl: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const subject = `Reminder: Pay your dues for ${leagueName}`;
  
  const textContent = `Hey, nerd. You still haven't paid your dues for ${leagueName}. Pay up or shut up.

Click here to pay now:
${paymentUrl}

Thanks,
LeagueVault Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Payment Reminder</h2>
      <p>Hey, nerd. You still haven't paid your dues for <strong>${leagueName}</strong>. Pay up or shut up.</p>
      <p style="margin: 24px 0;">
        <a href="${paymentUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Pay Now
        </a>
      </p>
      <p style="color: #666; font-size: 14px;">Or copy this link: ${paymentUrl}</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
      <p style="color: #999; font-size: 12px;">LeagueVault - Fantasy Sports Payment Management</p>
    </div>
  `;

  return sendEmail(to, subject, textContent, htmlContent);
}

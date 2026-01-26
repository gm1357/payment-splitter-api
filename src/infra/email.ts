import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const smtpConfig: SMTPTransport.Options = {
      host: process.env.EMAIL_SMTP_HOST,
      port: Number(process.env.EMAIL_SMTP_PORT),
      auth: {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASSWORD,
      },
      secure: process.env.NODE_ENV === 'production',
    };
    transporter = nodemailer.createTransport(smtpConfig);
  }
  return transporter;
}

async function send(mailOptions: Mail.Options) {
  try {
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    console.error(error);
    throw new Error('Failed to send email');
  }
}

const email = {
  send,
};

export default email;

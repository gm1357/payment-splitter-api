import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

const logger = new Logger('EmailService');

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!process.env.EMAIL_SMTP_HOST || !process.env.EMAIL_SMTP_PORT) {
      throw new Error(
        'Missing required email configuration: EMAIL_SMTP_HOST and EMAIL_SMTP_PORT must be set',
      );
    }

    const smtpConfig: SMTPTransport.Options = {
      host: process.env.EMAIL_SMTP_HOST,
      port: Number(process.env.EMAIL_SMTP_PORT),
      secure: process.env.NODE_ENV === 'production',
    };

    // Only set auth if credentials are provided
    if (process.env.EMAIL_SMTP_USER && process.env.EMAIL_SMTP_PASSWORD) {
      smtpConfig.auth = {
        user: process.env.EMAIL_SMTP_USER,
        pass: process.env.EMAIL_SMTP_PASSWORD,
      };
    }

    transporter = nodemailer.createTransport(smtpConfig);
  }
  return transporter;
}

async function send(mailOptions: Mail.Options) {
  try {
    await getTransporter().sendMail(mailOptions);
  } catch (error) {
    logger.error('Failed to send email', error);
    throw new Error('Failed to send email');
  }
}

const email = {
  send,
};

export default email;

'use strict';

const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
}

async function sendOtpSms(phoneWithCountryCode, otp) {
  if (!client || !fromNumber) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SmsService] No Twilio config; OTP (dev):', otp);
      return { success: true, devOtp: otp };
    }
    throw new Error('SMS provider not configured');
  }

  const message = await client.messages.create({
    body: `Your FractoLand verification code is: ${otp}. Valid for 10 minutes.`,
    from: fromNumber,
    to: phoneWithCountryCode,
  });
  return { success: true, sid: message.sid };
}

function formatPhoneWithCountryCode(countryCode, phone) {
  const code = (countryCode || '+91').replace(/\D/g, '');
  const num = (phone || '').replace(/\D/g, '');
  return `+${code}${num}`;
}

module.exports = {
  sendOtpSms,
  formatPhoneWithCountryCode,
  isConfigured: Boolean(client && fromNumber),
};

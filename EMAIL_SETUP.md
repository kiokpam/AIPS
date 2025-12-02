# Email Configuration Guide

This guide explains how to set up email for password reset functionality in AIPS.

## Quick Setup (Gmail)

### Step 1: Create Gmail App Password

1. **Enable 2-Factor Authentication** (required)
   - Go to: https://myaccount.google.com/security
   - Click "2-Step Verification"
   - Follow the setup steps

2. **Generate App Password**
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other" → Type: "AIPS"
   - Click "Generate"
   - **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

### Step 2: Create .env File

Create a file named `.env` in the project root with:

```bash
# Email Configuration
EMAIL_PROVIDER=smtp
EMAIL_FROM_ADDRESS=your-email@gmail.com
EMAIL_FROM_NAME=AIPS
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=abcd efgh ijkl mnop
SMTP_USE_TLS=true
```

Replace:
- `your-email@gmail.com` with your Gmail address
- `abcd efgh ijkl mnop` with your App Password (keep the spaces)

### Step 3: Restart the System

```bash
docker-compose down
docker-compose up -d --build
```

---

## Alternative: SendGrid

SendGrid is better for production use.

### Step 1: Create SendGrid Account

1. Sign up at: https://sendgrid.com
2. Go to Settings → API Keys
3. Create an API Key with "Mail Send" permission
4. Copy the key (starts with `SG.`)

### Step 2: Create .env File

```bash
EMAIL_PROVIDER=sendgrid
EMAIL_FROM_ADDRESS=noreply@yourdomain.com
EMAIL_FROM_NAME=AIPS
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: Install SendGrid Package

Add to `backend/requirements.txt`:
```
sendgrid>=6.0.0
```

Then rebuild:
```bash
docker-compose down
docker-compose up -d --build
```

---

## Development Mode (No Email)

By default, emails are logged to console instead of being sent:

```bash
EMAIL_PROVIDER=console
```

In this mode:
- Password reset links are shown directly in the UI
- Email content is printed to backend logs
- Perfect for local development and testing

---

## Troubleshooting

### Gmail: "Less secure app access" Error
- This shouldn't happen with App Passwords
- Make sure you're using an App Password, not your regular password

### Gmail: "Username and Password not accepted"
- Enable 2-Factor Authentication first
- Generate a new App Password
- Check for typos in email/password

### Emails Not Sending
1. Check backend logs: `docker-compose logs backend`
2. Verify environment variables are set
3. Test with console provider first

### Check Current Email Provider
```bash
docker-compose logs backend | grep "Email service"
```

---

## Security Notes

1. **Never commit `.env` files** - They contain secrets
2. **Use App Passwords** - Never use your real Gmail password
3. **Use different email for production** - Don't use personal Gmail
4. **Consider SendGrid for production** - Better deliverability and tracking


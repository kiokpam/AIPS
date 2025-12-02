"""
Email Service
Handles sending emails for password reset, invitations, etc.
Supports multiple providers: SMTP, SendGrid
"""

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class EmailProvider(ABC):
    """Abstract base class for email providers"""
    
    @abstractmethod
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email. Returns True if successful."""
        pass


class SMTPProvider(EmailProvider):
    """SMTP email provider for generic email servers"""
    
    def __init__(
        self,
        host: str,
        port: int,
        username: str,
        password: str,
        from_email: str,
        from_name: str = "AIPS",
        use_tls: bool = True
    ):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.from_email = from_email
        self.from_name = from_name
        self.use_tls = use_tls
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            
            # Attach text and HTML parts
            if text_content:
                msg.attach(MIMEText(text_content, 'plain'))
            msg.attach(MIMEText(html_content, 'html'))
            
            # Connect and send
            if self.use_tls:
                server = smtplib.SMTP(self.host, self.port)
                server.starttls()
            else:
                server = smtplib.SMTP_SSL(self.host, self.port)
            
            server.login(self.username, self.password)
            server.sendmail(self.from_email, to_email, msg.as_string())
            server.quit()
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False


class SendGridProvider(EmailProvider):
    """SendGrid email provider"""
    
    def __init__(self, api_key: str, from_email: str, from_name: str = "AIPS"):
        self.api_key = api_key
        self.from_email = from_email
        self.from_name = from_name
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        try:
            # Import sendgrid only when needed
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Email, To, Content
            
            message = Mail(
                from_email=Email(self.from_email, self.from_name),
                to_emails=To(to_email),
                subject=subject,
                html_content=Content("text/html", html_content)
            )
            
            if text_content:
                message.add_content(Content("text/plain", text_content))
            
            sg = SendGridAPIClient(self.api_key)
            response = sg.send(message)
            
            if response.status_code in [200, 201, 202]:
                logger.info(f"Email sent successfully to {to_email} via SendGrid")
                return True
            else:
                logger.error(f"SendGrid returned status {response.status_code}")
                return False
                
        except ImportError:
            logger.error("SendGrid package not installed. Run: pip install sendgrid")
            return False
        except Exception as e:
            logger.error(f"Failed to send email via SendGrid to {to_email}: {e}")
            return False


class ConsoleProvider(EmailProvider):
    """Development provider that logs emails to console instead of sending"""
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        logger.info("=" * 60)
        logger.info("📧 EMAIL (Development Mode - Not Actually Sent)")
        logger.info("=" * 60)
        logger.info(f"To: {to_email}")
        logger.info(f"Subject: {subject}")
        logger.info("-" * 60)
        logger.info("Content:")
        logger.info(text_content or html_content[:500])
        logger.info("=" * 60)
        return True


class EmailService:
    """
    Email service that manages email sending across the application.
    Automatically selects provider based on configuration.
    """
    
    def __init__(self):
        self._provider: Optional[EmailProvider] = None
        self._frontend_url: str = "http://localhost:3000"
        self._initialized = False
    
    def initialize(
        self,
        provider: str = "console",
        frontend_url: str = "http://localhost:3000",
        # SMTP settings
        smtp_host: Optional[str] = None,
        smtp_port: int = 587,
        smtp_username: Optional[str] = None,
        smtp_password: Optional[str] = None,
        smtp_use_tls: bool = True,
        # SendGrid settings
        sendgrid_api_key: Optional[str] = None,
        # Common settings
        from_email: str = "noreply@aips.local",
        from_name: str = "AIPS"
    ):
        """Initialize the email service with the appropriate provider."""
        self._frontend_url = frontend_url
        
        if provider == "smtp" and smtp_host and smtp_username and smtp_password:
            self._provider = SMTPProvider(
                host=smtp_host,
                port=smtp_port,
                username=smtp_username,
                password=smtp_password,
                from_email=from_email,
                from_name=from_name,
                use_tls=smtp_use_tls
            )
            logger.info(f"Email service initialized with SMTP provider ({smtp_host})")
            
        elif provider == "sendgrid" and sendgrid_api_key:
            self._provider = SendGridProvider(
                api_key=sendgrid_api_key,
                from_email=from_email,
                from_name=from_name
            )
            logger.info("Email service initialized with SendGrid provider")
            
        else:
            self._provider = ConsoleProvider()
            logger.info("Email service initialized with Console provider (development mode)")
        
        self._initialized = True
    
    @property
    def is_production(self) -> bool:
        """Check if using a real email provider (not console)."""
        return not isinstance(self._provider, ConsoleProvider)
    
    def send_password_reset_email(self, to_email: str, reset_token: str, user_name: str = "User") -> bool:
        """Send a password reset email."""
        if not self._initialized:
            self.initialize()
        
        reset_url = f"{self._frontend_url}/reset-password?token={reset_token}"
        
        subject = "Reset Your AIPS Password"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #1e293b; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🔐 AIPS</h1>
                            <p style="margin: 10px 0 0; color: #bfdbfe; font-size: 14px;">AI-Powered Store Surveillance</p>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <h2 style="margin: 0 0 20px; color: #f1f5f9; font-size: 24px;">Password Reset Request</h2>
                            
                            <p style="margin: 0 0 20px; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                Hi {user_name},
                            </p>
                            
                            <p style="margin: 0 0 30px; color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                We received a request to reset your password. Click the button below to create a new password:
                            </p>
                            
                            <!-- Button -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td align="center" style="padding: 20px 0;">
                                        <a href="{reset_url}" 
                                           style="display: inline-block; padding: 16px 40px; background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px; box-shadow: 0 4px 14px 0 rgba(59, 130, 246, 0.4);">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            
                            <p style="margin: 30px 0 20px; color: #64748b; font-size: 14px; line-height: 1.6;">
                                This link will expire in <strong style="color: #f1f5f9;">1 hour</strong> for security reasons.
                            </p>
                            
                            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.6;">
                                If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
                            </p>
                            
                            <!-- Divider -->
                            <hr style="border: none; border-top: 1px solid #334155; margin: 30px 0;">
                            
                            <p style="margin: 0; color: #475569; font-size: 12px; line-height: 1.6;">
                                If the button doesn't work, copy and paste this link into your browser:
                            </p>
                            <p style="margin: 10px 0 0; word-break: break-all;">
                                <a href="{reset_url}" style="color: #3b82f6; font-size: 12px; text-decoration: none;">{reset_url}</a>
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 30px 40px; background-color: #0f172a; text-align: center;">
                            <p style="margin: 0 0 10px; color: #475569; font-size: 12px;">
                                © {__import__('datetime').datetime.now().year} AIPS - AI-Powered Store Surveillance
                            </p>
                            <p style="margin: 0; color: #475569; font-size: 12px;">
                                This is an automated message. Please do not reply.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        
        text_content = f"""
AIPS - Password Reset Request

Hi {user_name},

We received a request to reset your password. Click the link below to create a new password:

{reset_url}

This link will expire in 1 hour for security reasons.

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

---
© {__import__('datetime').datetime.now().year} AIPS - AI-Powered Store Surveillance
This is an automated message. Please do not reply.
"""
        
        return self._provider.send_email(to_email, subject, html_content, text_content)
    
    def send_welcome_email(self, to_email: str, user_name: str, organization_name: str) -> bool:
        """Send a welcome email to new users."""
        if not self._initialized:
            self.initialize()
        
        login_url = f"{self._frontend_url}/login"
        
        subject = f"Welcome to AIPS - {organization_name}"
        
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #1e293b; border-radius: 16px; overflow: hidden;">
                    <tr>
                        <td style="padding: 40px; text-align: center; background: linear-gradient(135deg, #059669 0%, #10b981 100%);">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px;">🎉 Welcome to AIPS!</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #f1f5f9; font-size: 18px;">Hi {user_name},</p>
                            <p style="color: #94a3b8; font-size: 16px; line-height: 1.6;">
                                Welcome to <strong>{organization_name}</strong>! Your account has been created successfully.
                            </p>
                            <table role="presentation" style="width: 100%;">
                                <tr>
                                    <td align="center" style="padding: 30px 0;">
                                        <a href="{login_url}" style="display: inline-block; padding: 16px 40px; background: #10b981; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                            Go to Dashboard
                                        </a>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        
        text_content = f"""
Welcome to AIPS!

Hi {user_name},

Welcome to {organization_name}! Your account has been created successfully.

Login here: {login_url}

---
AIPS - AI-Powered Store Surveillance
"""
        
        return self._provider.send_email(to_email, subject, html_content, text_content)


# Global email service instance
email_service = EmailService()


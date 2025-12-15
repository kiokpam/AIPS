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
        logger.info(f"EMAIL (Console Provider)")
        logger.info(f"To: {to_email}")
        logger.info(f"Subject: {subject}")
        logger.info(f"Content: {html_content}")
        if text_content:
            logger.info(f"Text: {text_content}")
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
    
    def send_email(
        self,
        to_email: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None
    ) -> bool:
        """Send an email using the configured provider."""
        if not self._initialized:
            logger.warning("Email service not initialized. Using console provider.")
            self._provider = ConsoleProvider()
        
        if not self._provider:
            logger.error("Email provider not configured")
            return False
        
        return self._provider.send_email(to_email, subject, html_content, text_content)
    
    def send_password_reset_email(self, to_email: str, reset_token: str) -> bool:
        """Send password reset email with token."""
        reset_url = f"{self._frontend_url}/reset-password?token={reset_token}"
        
        html_content = f"""
        <html>
            <body>
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password. Click the link below to reset it:</p>
                <p><a href="{reset_url}">Reset Password</a></p>
                <p>If you didn't request this, please ignore this email.</p>
                <p>This link will expire in 1 hour.</p>
            </body>
        </html>
        """
        
        text_content = f"""
        Password Reset Request
        
        You requested to reset your password. Visit the following link to reset it:
        {reset_url}
        
        If you didn't request this, please ignore this email.
        This link will expire in 1 hour.
        """
        
        return self.send_email(
            to_email=to_email,
            subject="Password Reset Request",
            html_content=html_content,
            text_content=text_content
        )


# Global instance
email_service = EmailService()


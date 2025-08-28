import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '../../utils/rate-limiter';
import { createSecureResponse, handleCORSPreflight } from '../../utils/security-headers';

// This endpoint needs to be server-rendered to handle POST requests
export const prerender = false;

// Handle CORS preflight requests
export const OPTIONS: APIRoute = async ({ request }) => {
  const corsResponse = handleCORSPreflight(request);
  return corsResponse || createSecureResponse({ message: 'Method not allowed' }, 405);
};

export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, RATE_LIMITS.waitlist);
    
    if (!rateLimitResult.allowed) {
      return createSecureResponse(
        { 
          success: false, 
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime
        },
        429
      );
    }

    // Parse form data
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const experience = formData.get('experience') as string;
    const updates = formData.get('updates') === 'true';

    // Comprehensive input validation
    if (!email) {
      return createSecureResponse(
        { 
          success: false, 
          error: 'Email is required' 
        },
        400
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createSecureResponse(
        { 
          success: false, 
          error: 'Please enter a valid email address' 
        },
        400
      );
    }

    // Validate role field
    const allowedRoles = ['developer', 'student', 'maker', 'researcher', 'educator', 'hobbyist', 'other'];
    if (role && !allowedRoles.includes(role.toLowerCase())) {
      return createSecureResponse(
        { 
          success: false, 
          error: 'Invalid role selection' 
        },
        400
      );
    }

    // Validate experience field
    const allowedExperience = ['beginner', 'intermediate', 'advanced'];
    if (experience && !allowedExperience.includes(experience.toLowerCase())) {
      return createSecureResponse(
        { 
          success: false, 
          error: 'Invalid experience level' 
        },
        400
      );
    }

    // Sanitize inputs
    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedRole = role ? role.trim().toLowerCase() : null;
    const sanitizedExperience = experience ? experience.trim().toLowerCase() : null;

    // Initialize Supabase client
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Missing Supabase configuration');
      }
      return createSecureResponse(
        { 
          success: false, 
          error: 'Service temporarily unavailable' 
        },
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Generate confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    
    // Prepare data for insertion with double opt-in support
    const waitlistData = {
      email: sanitizedEmail,
      role: sanitizedRole,
      experience: sanitizedExperience,
      updates: updates,
      status: 'pending',
      confirmation_token: confirmationToken
    };

    // Insert into Supabase
    const { data, error } = await supabase
      .from('waitlist')
      .insert([waitlistData])
      .select()
      .single();

    if (error) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Supabase error:', error);
      }
      
      // Handle duplicate email - check if already confirmed or pending
      if (error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) {
        // Check existing registration status
        const { data: existingUser } = await supabase
          .from('waitlist')
          .select('status, email')
          .eq('email', email.toLowerCase().trim())
          .single();
          
        if (existingUser?.status === 'confirmed') {
          return createSecureResponse(
            { 
              success: true, 
              message: 'Great news! This email is already confirmed on the waitlist. You\'re all set for the PyMCU Alpha release! 🚀' 
            },
            200
          );
        } else if (existingUser?.status === 'pending') {
          return createSecureResponse(
            { 
              success: true, 
              message: 'We\'ve already sent a confirmation email to this address. Please check your inbox and spam folder! 📧' 
            },
            200
          );
        }
      }
      
      // Handle RLS policy violation
      if (error.code === '42501' || error.message.includes('row-level security')) {
        // Log detailed error only in development
        if (import.meta.env.MODE === 'development') {
          console.error('RLS Policy Error - Check Supabase service role key and RLS policies');
        }
        return createSecureResponse(
          { 
            success: false, 
            error: 'Service temporarily unavailable' 
          },
          500
        );
      }
      
      return createSecureResponse(
        { 
          success: false, 
          error: 'Database error occurred. Please try again.' 
        },
        500
      );
    }

    // Send confirmation email
    try {
      await sendConfirmationEmail(sanitizedEmail, confirmationToken);
    } catch (emailError) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Failed to send confirmation email:', emailError);
      }
      // Don't fail the registration if email fails - user can still be manually confirmed
    }


    return createSecureResponse(
      { 
        success: true, 
        message: 'Almost there! We\'ve sent a confirmation email to your inbox. Please click the link to complete your registration for the PyMCU Alpha waitlist! 📧',
        data: {
          id: data.id,
          email: data.email,
          status: 'pending',
          created_at: data.created_at
        }
      },
      201
    );

  } catch (error) {
    // Log detailed error only in development
    if (import.meta.env.MODE === 'development') {
      console.error('Waitlist API error:', error);
    }
    
    return createSecureResponse(
      { 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      },
      500
    );
  }
};

// Email sending function for confirmation using Amazon SES
async function sendConfirmationEmail(email: string, token: string) {
  const confirmationUrl = `${import.meta.env.SITE || 'http://localhost:4321'}/confirm?token=${token}`;
  const unsubscribeUrl = `${import.meta.env.SITE || 'http://localhost:4321'}/unsubscribe?email=${encodeURIComponent(email)}`;
  
  // Check if SES is configured
  const awsRegion = import.meta.env.AWS_REGION;
  const awsAccessKeyId = import.meta.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = import.meta.env.AWS_SECRET_ACCESS_KEY;
  const sesFromEmail = import.meta.env.SES_FROM_EMAIL;
  const sesFromName = import.meta.env.SES_FROM_NAME || 'PyMCU Team';

  if (!awsRegion || !awsAccessKeyId || !awsSecretAccessKey || !sesFromEmail) {
    // SES not configured - email sending will be skipped
    return;
  }

  // Initialize SES client
  const sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  // Create HTML email template
  const htmlBody = createConfirmationEmailHTML(email, confirmationUrl, unsubscribeUrl);
  const textBody = createConfirmationEmailText(email, confirmationUrl, unsubscribeUrl);

  const params = {
    Destination: {
      ToAddresses: [email],
    },
    Message: {
      Body: {
        Html: {
          Charset: 'UTF-8',
          Data: htmlBody,
        },
        Text: {
          Charset: 'UTF-8',
          Data: textBody,
        },
      },
      Subject: {
        Charset: 'UTF-8',
        Data: 'Confirm your PyMCU Alpha Waitlist Registration',
      },
    },
    Source: `${sesFromName} <${sesFromEmail}>`,
    ReplyToAddresses: [sesFromEmail],
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    
    return response;
  } catch (error) {
    // Log detailed error only in development
    if (import.meta.env.MODE === 'development') {
      console.error('Failed to send confirmation email via SES:', error);
    }
    throw error;
  }
}

// Create HTML email template matching PyMCU website design
function createConfirmationEmailHTML(_email: string, confirmationUrl: string, unsubscribeUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirm your PyMCU Alpha Waitlist Registration</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: rgb(16, 16, 16); 
            background: rgb(255, 255, 255);
            margin: 0;
            padding: 0;
        }
        
        .email-container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: rgb(255, 255, 255);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        }
        
        .header { 
            background: linear-gradient(135deg, rgb(1, 97, 239) 0%, rgb(1, 84, 207) 50%, rgb(42, 124, 181) 100%);
            color: white; 
            padding: 40px 30px; 
            text-align: center; 
        }
        
        .logo { 
            font-size: 32px; 
            font-weight: 700; 
            margin-bottom: 8px;
            letter-spacing: -0.025em;
        }
        
        .logo .accent { 
            color: rgb(255, 255, 255); 
        }
        
        .header-subtitle { 
            font-size: 16px; 
            opacity: 0.9; 
            font-weight: 500;
        }
        
        .content { 
            background: rgb(255, 255, 255); 
            padding: 40px 30px; 
        }
        
        .greeting { 
            font-size: 24px; 
            font-weight: 600; 
            color: rgb(0, 0, 0); 
            margin-bottom: 20px;
        }
        
        .text { 
            font-size: 16px; 
            margin-bottom: 20px; 
            color: rgb(16, 16, 16);
        }
        
        .highlight { 
            font-weight: 600; 
            color: rgb(1, 97, 239);
        }
        
        .button-container { 
            text-align: center; 
            margin: 30px 0; 
        }
        
        .button { 
            display: inline-block; 
            background: linear-gradient(135deg, rgb(37, 99, 235) 0%, rgb(29, 78, 216) 100%);
            color: rgb(255, 255, 255); 
            text-decoration: none; 
            padding: 16px 32px; 
            border-radius: 8px; 
            font-weight: 600; 
            font-size: 16px;
            box-shadow: 0 4px 14px 0 rgba(37, 99, 235, 0.4);
            transition: all 0.2s ease;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .button:hover { 
            background: linear-gradient(135deg, rgb(29, 78, 216) 0%, rgb(30, 64, 175) 100%);
            box-shadow: 0 6px 20px 0 rgba(37, 99, 235, 0.6);
            transform: translateY(-1px);
        }
        
        .info-box { 
            background: rgb(248, 250, 252); 
            border-left: 4px solid rgb(1, 97, 239); 
            padding: 20px; 
            margin: 25px 0; 
            border-radius: 0 8px 8px 0;
        }
        
        .info-box .title { 
            font-weight: 600; 
            color: rgb(1, 97, 239); 
            margin-bottom: 8px;
        }
        
        .footer { 
            text-align: center; 
            margin-top: 40px; 
            padding-top: 30px; 
            border-top: 1px solid rgb(229, 231, 235); 
        }
        
        .footer-text { 
            font-size: 16px; 
            font-weight: 600; 
            color: rgb(0, 0, 0); 
            margin-bottom: 8px;
        }
        
        .footer-tagline { 
            font-size: 14px; 
            color: rgb(16, 16, 16, 0.66); 
            font-style: italic;
        }
        
        .unsubscribe { 
            background: rgb(249, 250, 251); 
            padding: 20px; 
            margin-top: 30px; 
            border-radius: 8px;
            border: 1px solid rgb(229, 231, 235);
        }
        
        .unsubscribe-text { 
            font-size: 12px; 
            color: rgb(16, 16, 16, 0.66); 
            line-height: 1.5;
        }
        
        .unsubscribe a { 
            color: rgb(1, 97, 239); 
            text-decoration: none;
        }
        
        .unsubscribe a:hover { 
            text-decoration: underline;
        }
        
        @media (max-width: 600px) {
            .email-container { margin: 0; }
            .header, .content { padding: 30px 20px; }
            .logo { font-size: 28px; }
            .greeting { font-size: 22px; }
            .button { padding: 14px 28px; font-size: 15px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <div class="logo">
                Py<span class="accent">MCU</span>
            </div>
            <div class="header-subtitle">You're almost in the Alpha waitlist</div>
        </div>
        
        <div class="content">
            <div class="greeting">Hi there! 👋</div>
            
            <div class="text">
                Thanks for your interest in <span class="highlight">PyMCU Alpha</span>! We're excited to have you join our community of early adopters who are shaping the future of microcontroller development.
            </div>
            
            <div class="text">
                To complete your registration and secure your spot on the waitlist, please confirm your email address by clicking the button below:
            </div>
            
            <div class="button-container">
                <table border="0" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
                    <tr>
                        <td style="background-color: #1d4ed8; border-radius: 8px; padding: 0;">
                            <a href="${confirmationUrl}" style="background-color: #1d4ed8; color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; font-family: 'Inter', Arial, sans-serif; display: block; text-align: center;">
                                Confirm Email Address
                            </a>
                        </td>
                    </tr>
                </table>
            </div>
            
            <div class="info-box">
                <div class="title">Why confirm your email?</div>
                <div>This helps us ensure you receive important updates about PyMCU Alpha releases and prevents spam registrations. Your privacy is important to us.</div>
            </div>
            
            <div class="text">
                If you didn't sign up for the PyMCU waitlist, you can safely ignore this email.
            </div>
            
            <div class="footer">
                <div class="footer-text">Best regards,<br>The PyMCU Team 🚀</div>
                <div class="footer-tagline">Python to MCUs. Free. Deterministic. AOT.</div>
            </div>
        </div>
        
        <div class="unsubscribe">
            <div class="unsubscribe-text">
                <strong>Note:</strong> This confirmation link will expire in 24 hours for security reasons.<br>
                If you no longer wish to receive emails from us, you can <a href="${unsubscribeUrl}">unsubscribe here</a>.
            </div>
        </div>
    </div>
</body>
</html>
  `.trim();
}

// Create plain text email template
function createConfirmationEmailText(_email: string, confirmationUrl: string, unsubscribeUrl: string): string {
  return `
PyMCU Alpha Waitlist - Email Confirmation Required

Hi there! 👋

Thanks for your interest in PyMCU Alpha! We're excited to have you join our community of early adopters.

To complete your registration and secure your spot on the waitlist, please confirm your email address by visiting this link:

${confirmationUrl}

Why confirm? This helps us ensure you receive important updates about PyMCU Alpha and prevents spam registrations.

If you didn't sign up for the PyMCU waitlist, you can safely ignore this email.

Best regards,
The PyMCU Team 🚀
Building the future of microcontroller development

---
Note: This confirmation link will expire in 24 hours for security reasons.
If you no longer wish to receive emails from us, visit: ${unsubscribeUrl}
  `.trim();
}

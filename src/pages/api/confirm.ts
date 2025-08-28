import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '../../utils/rate-limiter';

// This endpoint needs to be server-rendered to handle GET requests
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, RATE_LIMITS.confirm);

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString(),
          },
        }
      );
    }

    const token = url.searchParams.get('token');

    // Input validation
    if (!token || typeof token !== 'string' || token.length !== 64) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid confirmation token',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Sanitize token (remove any non-hex characters)
    const sanitizedToken = token.replace(/[^a-f0-9]/gi, '');

    if (sanitizedToken.length !== 64) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid confirmation token format',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Missing Supabase configuration');
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Service temporarily unavailable',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Find user by confirmation token
    const { data: user, error: findError } = await supabase
      .from('waitlist')
      .select('id, email, status, created_at')
      .eq('confirmation_token', sanitizedToken)
      .single();

    if (findError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid or expired confirmation token',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if already confirmed
    if (user.status === 'confirmed') {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email already confirmed! You're all set for the PyMCU Alpha release! 🚀",
          data: {
            email: user.email,
            status: 'confirmed',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Check if unsubscribed
    if (user.status === 'unsubscribed') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'This email has been unsubscribed from the waitlist',
        }),
        {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Update status to confirmed
    const { data: updatedUser, error: updateError } = await supabase
      .from('waitlist')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmation_token: null, // Clear token for security
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Failed to confirm user:', updateError);
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Service temporarily unavailable',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email confirmed successfully! Welcome to the PyMCU Alpha waitlist! 🎉',
        data: {
          email: updatedUser.email,
          status: 'confirmed',
          confirmed_at: updatedUser.confirmed_at,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Log detailed error only in development
    if (import.meta.env.MODE === 'development') {
      console.error('Confirmation API error:', error);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: 'An unexpected error occurred. Please try again.',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};

import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '../../utils/rate-limiter';

// This endpoint needs to be server-rendered to handle GET and POST requests
export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, RATE_LIMITS.unsubscribe);
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime
        }),
        { 
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString()
          }
        }
      );
    }

    const email = url.searchParams.get('email');

    // Input validation
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Valid email parameter is required' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid email format' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Sanitize email
    const sanitizedEmail = email.toLowerCase().trim();


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
          error: 'Service temporarily unavailable' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Find user by email
    const { data: user, error: findError } = await supabase
      .from('waitlist')
      .select('id, email, status')
      .eq('email', sanitizedEmail)
      .single();

    if (findError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email not found in waitlist' 
        }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Note: We'll delete the user regardless of current status
    // This ensures complete removal and allows for re-registration

    // Delete user completely from waitlist (GDPR compliant)
    const { data: deleteData, error: deleteError } = await supabase
      .from('waitlist')
      .delete()
      .eq('id', user.id)
      .select();

    if (deleteError) {
      // Log detailed error only in development
      if (import.meta.env.MODE === 'development') {
        console.error('Failed to delete user:', deleteError);
      }
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Service temporarily unavailable' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if any rows were actually deleted
    if (!deleteData || deleteData.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found or could not be deleted.' 
        }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'You have been successfully removed from the PyMCU waitlist. Your email has been completely deleted from our system.',
        data: {
          email: user.email,
          removed_at: new Date().toISOString()
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    // Log detailed error only in development
    if (import.meta.env.MODE === 'development') {
      console.error('Unsubscribe API error:', error);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

// Also support POST for form submissions
export const POST: APIRoute = async ({ request }) => {
  try {
    // Rate limiting check
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(clientIP, RATE_LIMITS.unsubscribe);
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Too many requests. Please try again later.',
          resetTime: rateLimitResult.resetTime
        }),
        { 
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil((rateLimitResult.resetTime! - Date.now()) / 1000).toString()
          }
        }
      );
    }

    const formData = await request.formData();
    const email = formData.get('email') as string;

    // Input validation
    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Valid email is required' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid email format' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Redirect to GET handler with email parameter
    const url = new URL('/api/unsubscribe', import.meta.env.SITE || 'http://localhost:4321');
    url.searchParams.set('email', email);
    
    // Call the GET handler internally
    return await GET({ request, url } as any);

  } catch (error) {
    // Log detailed error only in development
    if (import.meta.env.MODE === 'development') {
      console.error('Unsubscribe POST API error:', error);
    }
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

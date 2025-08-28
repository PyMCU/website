import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// This endpoint needs to be server-rendered to handle GET requests
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Confirmation token is required' 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = import.meta.env.SUPABASE_URL;
    const supabaseServiceKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database configuration error' 
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

    // Find user by confirmation token
    const { data: user, error: findError } = await supabase
      .from('waitlist')
      .select('id, email, status, created_at')
      .eq('confirmation_token', token)
      .single();

    if (findError || !user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid or expired confirmation token' 
        }),
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if already confirmed
    if (user.status === 'confirmed') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Email already confirmed! You\'re all set for the PyMCU Alpha release! 🚀',
          data: {
            email: user.email,
            status: 'confirmed'
          }
        }),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Check if unsubscribed
    if (user.status === 'unsubscribed') {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'This email has been unsubscribed from the waitlist' 
        }),
        { 
          status: 410,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Update status to confirmed
    const { data: updatedUser, error: updateError } = await supabase
      .from('waitlist')
      .update({ 
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        confirmation_token: null // Clear token for security
      })
      .eq('id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to confirm user:', updateError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to confirm registration. Please try again.' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
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
          confirmed_at: updatedUser.confirmed_at
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Confirmation API error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

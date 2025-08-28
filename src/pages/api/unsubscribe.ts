import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// This endpoint needs to be server-rendered to handle GET and POST requests
export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const email = url.searchParams.get('email');

    if (!email) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email parameter is required' 
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

    // Find user by email
    const { data: user, error: findError } = await supabase
      .from('waitlist')
      .select('id, email, status')
      .eq('email', email.toLowerCase().trim())
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
      console.error('Failed to delete user:', deleteError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to unsubscribe. Please try again.' 
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
    console.error('Unsubscribe API error:', error);
    
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

// Also support POST for form submissions
export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const email = formData.get('email') as string;

    if (!email) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email is required' 
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
    return await GET({ url } as any);

  } catch (error) {
    console.error('Unsubscribe POST API error:', error);
    
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

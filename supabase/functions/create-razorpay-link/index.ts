import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://makemyreels.in';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { amount, projectId, projectTitle, clientName, clientEmail, clientPhone } = await req.json();

    if (!amount || !projectId) {
      throw new Error("Missing required parameters: amount or projectId");
    }

    // 1. Get Razorpay credentials from Supabase Secrets
    const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID');
    const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay credentials not configured in Edge Function secrets");
    }

    // 2. Call Razorpay API to create a Payment Link
    // Amount must be in paise (multiply by 100)
    const razorpayPayload = {
      amount: Math.round(amount * 100),
      currency: "INR",
      accept_partial: false,
      first_min_partial_amount: 0,
      description: `Payment for ${projectTitle || 'Video Production'}`,
      customer: {
        name: clientName || "Client",
        email: clientEmail || Deno.env.get('COMPANY_EMAIL') || "contact@makemyreels.com",
        contact: clientPhone || ""
      },
      notify: {
        sms: true,
        email: true
      },
      reminder_enable: true,
      notes: {
        project_id: projectId
      }
    };

    const basicAuth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);

    const razorpayRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${basicAuth}`
      },
      body: JSON.stringify(razorpayPayload)
    });

    const razorpayData = await razorpayRes.json();

    if (!razorpayRes.ok) {
      console.error("Razorpay Error:", razorpayData);
      throw new Error(razorpayData.error?.description || "Failed to create Razorpay link");
    }

    const paymentLinkUrl = razorpayData.short_url;
    const paymentLinkId = razorpayData.id;

    // 3. Update Supabase project record with the new link
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { error: updateError } = await supabaseClient
      .from('projects')
      .update({
        razorpay_link_url: paymentLinkUrl,
        razorpay_link_id: paymentLinkId,
        payment_status: 'Link Generated'
      })
      .eq('id', projectId);

    if (updateError) {
      console.error("Supabase Update Error:", updateError);
      throw new Error("Failed to update project with payment link");
    }

    return new Response(
      JSON.stringify({ success: true, paymentLinkUrl, paymentLinkId }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

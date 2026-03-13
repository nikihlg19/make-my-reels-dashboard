export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: any) => void;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color: string;
  };
}

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const initiatePayment = async (
  amount: number,
  clientDetails: { name: string; email?: string; phone: string },
  onSuccess: (response: any) => void,
  onError: (error: any) => void
) => {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded) {
    onError(new Error("Razorpay SDK failed to load. Are you online?"));
    return;
  }

  try {
    // 1. Create order on our backend
    const orderRes = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    
    if (!orderRes.ok) {
      throw new Error(`Failed to create order: ${await orderRes.text()}`);
    }

    const orderData = await orderRes.json();

    // 2. Initialize Razorpay Checkout
    const options: RazorpayOptions = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || '', // Enter the Key ID generated from the Dashboard
      amount: orderData.amount, // Amount is in currency subunits. Default currency is INR. Hence, 50000 refers to 50000 paise
      currency: orderData.currency,
      name: "Make My Reels",
      description: "Project Payment",
      order_id: orderData.id,
      handler: function (response: any) {
        onSuccess(response);
      },
      prefill: {
        name: clientDetails.name,
        email: clientDetails.email || 'billing@makemyreels.in',
        contact: clientDetails.phone,
      },
      theme: {
        color: "#4F46E5",
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.on('payment.failed', function (response: any) {
      onError(response.error);
    });
    rzp.open();

  } catch (error) {
    onError(error);
  }
};

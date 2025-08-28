// API response types for PyMCU project

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface WaitlistApiResponse extends ApiResponse {
  data?: {
    id: string;
    email: string;
    status: string;
    created_at: string;
  };
}

export interface ConfirmApiResponse extends ApiResponse {
  data?: {
    id: string;
    email: string;
    status: string;
    confirmed_at: string;
  };
}

export interface UnsubscribeApiResponse extends ApiResponse {
  data?: {
    email: string;
    removed_at: string;
  };
}

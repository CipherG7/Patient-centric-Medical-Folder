interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdentityConfig {
  client_id: string;
  nonce: string;
  callback: (response: GoogleCredentialResponse) => void;
  cancel_on_tap_outside?: boolean;
}

interface GoogleIdentityButtonOptions {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdentityConfig) => void;
        renderButton: (parent: HTMLElement, options: GoogleIdentityButtonOptions) => void;
      };
    };
  };
}
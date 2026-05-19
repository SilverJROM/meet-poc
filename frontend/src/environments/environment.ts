export const environment = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // B6 injects coturn TURN servers here via environment substitution.
  ],
};

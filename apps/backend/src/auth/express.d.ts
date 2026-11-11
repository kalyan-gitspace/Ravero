declare global {
  namespace Express {
    interface Request {
      customerAuth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

export {};

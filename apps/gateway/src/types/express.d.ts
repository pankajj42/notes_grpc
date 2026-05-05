export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }

    interface Response {
      locals: {
        user?: AuthenticatedUser;
        requestId?: string;
        validated: Record<string, unknown>;
      };
    }
  }
}

export {};
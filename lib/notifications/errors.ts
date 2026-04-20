export class NotConfiguredError extends Error {
  constructor(channel: string) {
    super(`Notification channel not configured: ${channel}`);
    this.name = "NotConfiguredError";
  }
}

export class RenderError extends Error {
  constructor(template: string, cause?: unknown) {
    super(`Failed to render template "${template}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "RenderError";
  }
}

export class TransportError extends Error {
  constructor(channel: string, cause: unknown) {
    super(`Transport ${channel} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TransportError";
  }
}

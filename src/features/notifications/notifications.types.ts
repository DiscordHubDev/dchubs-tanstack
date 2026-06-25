export type SendNotificationErrorPayload = {
  tag: string;
  message: string;
};

export type SendNotificationResult =
  | { success: true }
  | { success: false; error: SendNotificationErrorPayload };

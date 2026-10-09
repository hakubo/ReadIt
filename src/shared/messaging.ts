export type MessageType =
  | { type: "GENERATE_TTS"; text: string }
  | { type: "GET_SETTINGS" }
  | { type: "SETTINGS_UPDATED" };

export type MessageResponse =
  | { success: true; audioUrl: string }
  | { success: false; error: string }
  | { success: true };

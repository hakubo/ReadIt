import { getShapedVoiceFile, type VoiceId, type ShapedVoice } from "@/lib/resources";

export async function loadVoice(voiceId: VoiceId | string): Promise<ShapedVoice> {
  return getShapedVoiceFile(voiceId);
}

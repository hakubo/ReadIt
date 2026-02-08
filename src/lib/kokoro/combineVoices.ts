import { getShapedVoiceFile, type VoiceId } from "@/lib/resources";

export async function loadVoice(voiceId: VoiceId | string): Promise<number[][][]> {
  return getShapedVoiceFile(voiceId);
}

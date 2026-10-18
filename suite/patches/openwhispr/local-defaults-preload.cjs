// Suite profiles default to local inference before the original settings store hydrates.
// Existing explicit provider/model preferences are preserved.
if (typeof process !== "undefined" && process.argv?.includes("--plataforma-suite-managed")) {
  try {
    const providerKeys = [
      "useLocalWhisper",
      "transcriptionMode",
      "cloudTranscriptionMode",
      "cloudTranscriptionProvider",
      "localTranscriptionProvider",
      "whisperModel",
    ];
    if (providerKeys.every((key) => localStorage.getItem(key) === null)) {
      const defaults = {
        useLocalWhisper: "true",
        transcriptionMode: "local",
        localTranscriptionProvider: "whisper",
        whisperModel: "tiny",
      };
      for (const [key, value] of Object.entries(defaults)) localStorage.setItem(key, value);
    }
  } catch {
    // An unavailable origin must not prevent the original permission/onboarding UI.
  }
}

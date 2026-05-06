export async function getDeviceName(): Promise<string> {
  try {
    const { UAParser } = await import("ua-parser-js");
    const parser = new UAParser();
    const result = parser.getResult();
    const browser = result.browser.name || "Browser";
    const os = result.os.name || "Unknown OS";
    return `${browser} on ${os}`;
  } catch {
    return "Current device";
  }
}

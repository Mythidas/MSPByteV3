import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

export default class Encryption {
  static async encrypt(text: string, key: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(
      ALGORITHM,
      Buffer.from(key, "hex"),
      iv,
    );

    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      tag.toString("base64"),
      encrypted.toString("base64"),
    ].join(":");
  }

  static async decrypt(encryptedText: string, key: string) {
    const [ivB64, tagB64, dataB64] = encryptedText.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return undefined;

    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const encrypted = Buffer.from(dataB64, "base64");

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(key, "hex"),
      iv,
    );
    decipher.setAuthTag(tag);

    return (
      decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8")
    );
  }

  static sha256 = (s: string) =>
    crypto.createHash("sha256").update(s).digest("hex");

  // Now outputs base64 by default
  static genKey = () => crypto.randomBytes(32).toString("hex");
}

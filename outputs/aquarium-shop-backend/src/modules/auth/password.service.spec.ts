import { PasswordService } from "./password.service.js";

describe("PasswordService", () => {
  const service = new PasswordService();

  it("hashes with Argon2id and verifies the correct password", async () => {
    const hash = await service.hash("A-strong-development-password");

    expect(hash).toContain("$argon2id$");
    await expect(
      service.verify(hash, "A-strong-development-password"),
    ).resolves.toBe(true);
    await expect(service.verify(hash, "wrong-password")).resolves.toBe(false);
  });

  it("returns false for malformed hashes", async () => {
    await expect(service.verify("not-a-hash", "password")).resolves.toBe(false);
  });
});

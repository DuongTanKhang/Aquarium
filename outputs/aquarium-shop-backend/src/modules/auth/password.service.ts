import { Injectable } from "@nestjs/common";
import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AWeWb59ygN38+gGGH4CQpQ$HNG8CArv0AznSxI5L8Rcd5lQ4aE38ztGcpPEe/M1b48";

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  verifyDummy(password: string): Promise<boolean> {
    return this.verify(DUMMY_PASSWORD_HASH, password);
  }
}
